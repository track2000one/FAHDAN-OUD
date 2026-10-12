import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { deleteImage } from '../lib/google-drive.js';

export const productManagementRouter = Router();
productManagementRouter.use(requireOwner);

const idSchema=z.string().min(1).max(120);
const quantity=z.string().trim().regex(/^\d{1,9}(?:\.\d{1,3})?$/)
  .refine(v=>new Prisma.Decimal(v).gt(0));
const positiveMoney=z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/)
  .refine(v=>new Prisma.Decimal(v).gt(0));
const receiptSchema=z.object({
  requestKey:z.string().uuid(),quantityBase:quantity,totalCostSar:positiveMoney,
  supplierName:z.string().trim().min(2).max(160),
  invoiceReference:z.string().trim().max(100).default(''),
  receivedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});
const writeOffSchema=z.object({
  requestKey:z.string().uuid(),quantityBase:quantity,
  kind:z.enum(['LOSS','DAMAGE','ADJUSTMENT']),
  reason:z.string().trim().min(8).max(400)
});
class BusinessProblem extends Error{
  constructor(public status:number,message:string){super(message);}
}
const retryable=(e:unknown)=> e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2034';
const duplicate=(e:unknown)=> e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002';
function fail(err:unknown,res:import('express').Response,next:import('express').NextFunction){
  if(err instanceof BusinessProblem){res.status(err.status).json({error:err.message});return;}
  if(retryable(err)){res.status(409).json({error:'طرأ تحديث آخر على المخزون أو الصور. حدّث البيانات ثم حاول مرة أخرى.'});return;}
  if(duplicate(err)){res.status(409).json({error:'تم تنفيذ هذه العملية مسبقًا أو يوجد رقم مستند مكرر. حدّث القائمة للتحقق.'});return;}
  next(err);
}
function checkUnit(q:Prisma.Decimal,baseUnit:string){
  if(baseUnit==='PIECE'&&!q.mod(1).eq(0))
    throw new BusinessProblem(400,'المنتجات بالقطعة يجب أن يكون عددها صحيحًا.');
}
function receivedDate(date:string){
  const x=new Date(date+'T12:00:00.000Z');
  if(Number.isNaN(x.getTime())||x.toISOString().slice(0,10)!==date||
    x.getTime()>Date.now()+86400000)throw new BusinessProblem(400,'تاريخ الاستلام غير صحيح.');
  return x;
}
const summary=async(productId:string)=>{
  const [balance,history]=await Promise.all([
    prisma.inventoryBalance.findUnique({
      where:{productId},select:{onHandBase:true,reservedBase:true,reorderPoint:true,version:true}
    }),
    prisma.stockMovement.findMany({where:{productId},
      orderBy:{createdAt:'desc'},take:25,
      select:{id:true,kind:true,deltaBase:true,reason:true,createdAt:true,sourceRef:true}
    })
  ]);
  return {
    balance:balance?{
      onHandBase:balance.onHandBase.toString(),reservedBase:balance.reservedBase.toString(),
      availableBase:balance.onHandBase.sub(balance.reservedBase).toString(),
      reorderPoint:balance.reorderPoint.toString(),version:balance.version
    }:null,
    movements:history.map(m=>({...m,deltaBase:m.deltaBase.toString()}))
  };
};

productManagementRouter.get('/products/:id/stock',async(req,res,next)=>{
  try{
    const product=await prisma.product.findFirst({
      where:{id:req.params.id,isDemo:false},select:{id:true}
    });
    if(!product){res.status(404).json({error:'المنتج غير موجود.'});return;}
    res.setHeader('Cache-Control','no-store');
    res.json(await summary(product.id));
  }catch(e){next(e);}
});

productManagementRouter.post('/products/:id/stock/receipt',async(req,res,next)=>{
  const parsed=receiptSchema.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:'أدخل الكمية والتكلفة والمورد وتاريخ الاستلام ورقم عملية صالحًا.'});return;}
  const d=parsed.data,amount=new Prisma.Decimal(d.quantityBase),cost=new Prisma.Decimal(d.totalCostSar);
  try{
    const date=receivedDate(d.receivedAt);
    const productId=idSchema.parse(req.params.id);
    await prisma.$transaction(async tx=>{
      const product=await tx.product.findFirst({where:{id:productId,isDemo:false},
        select:{id:true,baseUnit:true,balance:{select:{version:true}}}});
      if(!product?.balance)throw new BusinessProblem(404,'المنتج أو رصيده غير موجود.');
      checkUnit(amount,product.baseUnit);
      const currentSupplier=await tx.supplier.findFirst({
        where:{name:{equals:d.supplierName,mode:'insensitive'}},select:{id:true}
      });
      const supplier=currentSupplier||await tx.supplier.create({
        data:{name:d.supplierName},select:{id:true}
      });
      const purchase=await tx.purchase.create({
        data:{supplierId:supplier.id,invoiceReference:d.invoiceReference||null,receivedAt:date,
          currency:'SAR',inboundExtrasSar:0,
          lines:{create:{productId,quantityBase:amount,totalCostSar:cost}}},
        select:{id:true,lines:{select:{id:true}}}
      });
      const lot=await tx.inventoryLot.create({data:{
        lotNumber:'FHD-LOT-'+randomUUID(),productId,
        purchaseLineId:purchase.lines[0].id,acquiredBase:amount,remainingBase:amount,
        unitCostSar:cost.div(amount).toDecimalPlaces(6)
      },select:{id:true}});
      await tx.stockMovement.create({data:{
        productId,lotId:lot.id,kind:'PURCHASE_RECEIPT',deltaBase:amount,
        unitCostSar:cost.div(amount).toDecimalPlaces(6),
        reason:'استلام دفعة شراء موثقة',
        sourceRef:purchase.id,idempotencyKey:d.requestKey
      }});
      const updated=await tx.inventoryBalance.updateMany({
        where:{productId,version:product.balance.version},
        data:{onHandBase:{increment:amount},version:{increment:1}}
      });
      if(updated.count!==1)throw new BusinessProblem(409,'تغير رصيد المنتج أثناء الاستلام؛ حدّث القائمة.');
      await tx.auditLog.create({data:{
        actorId:res.locals.adminId,entityType:'Product',entityId:productId,
        event:'INVENTORY_PURCHASE_RECEIVED',metadata:{
          purchaseId:purchase.id,quantityBase:d.quantityBase,totalCostSar:d.totalCostSar,
          supplierName:d.supplierName,reference:d.invoiceReference||null
        }
      }});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    res.status(201).json({message:'تم استلام الدفعة وتحديث الرصيد وإنشاء سجل شراء وحركة مخزون موثقة.',...(await summary(productId))});
  }catch(e){fail(e,res,next);}
});

productManagementRouter.post('/products/:id/stock/writeoff',async(req,res,next)=>{
  const parsed=writeOffSchema.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:'أدخل كمية صحيحة ونوع النقص وسببًا واضحًا لا يقل عن 8 أحرف.'});return;}
  const d=parsed.data,amount=new Prisma.Decimal(d.quantityBase);
  try{
    const productId=idSchema.parse(req.params.id);
    await prisma.$transaction(async tx=>{
      const product=await tx.product.findFirst({where:{id:productId,isDemo:false},
        select:{id:true,baseUnit:true}});
      if(!product)throw new BusinessProblem(404,'المنتج غير موجود.');
      checkUnit(amount,product.baseUnit);
      const balance=await tx.inventoryBalance.findUnique({
        where:{productId},select:{version:true,onHandBase:true,reservedBase:true}
      });
      if(!balance||balance.onHandBase.sub(balance.reservedBase).lt(amount))
        throw new BusinessProblem(409,'الكمية المطلوب خصمها أكبر من الرصيد المتاح غير المحجوز.');
      const lots=await tx.inventoryLot.findMany({
        where:{productId,remainingBase:{gt:0}},orderBy:{createdAt:'asc'},
        select:{id:true,remainingBase:true,unitCostSar:true}
      });
      let left=amount,part=0;
      for(const lot of lots){
        if(left.lte(0))break;
        const deduction=Prisma.Decimal.min(left,lot.remainingBase);
        const updated=await tx.inventoryLot.updateMany({
          where:{id:lot.id,remainingBase:{gte:deduction}},
          data:{remainingBase:{decrement:deduction}}
        });
        if(updated.count!==1)throw new BusinessProblem(409,'تغيرت تفاصيل دفعات المخزون. أعد المحاولة.');
        await tx.stockMovement.create({data:{
          productId,lotId:lot.id,kind:d.kind,deltaBase:deduction.neg(),
          unitCostSar:lot.unitCostSar,
          sourceRef:d.requestKey,idempotencyKey:d.requestKey+':'+part++,
          reason:d.reason
        }});
        left=left.sub(deduction);
      }
      if(left.gt(0))throw new BusinessProblem(409,
        'سجلات دفعات المخزون لا تغطي الكمية المطلوب خصمها. يلزم فحص الرصيد قبل التصحيح.');
      const updated=await tx.inventoryBalance.updateMany({
        where:{productId,version:balance.version,
          onHandBase:{gte:balance.reservedBase.add(amount)}},
        data:{onHandBase:{decrement:amount},version:{increment:1}}
      });
      if(updated.count!==1)throw new BusinessProblem(409,'تغير الرصيد أثناء العملية؛ أعد المحاولة.');
      await tx.auditLog.create({data:{
        actorId:res.locals.adminId,entityType:'Product',entityId:productId,
        event:'INVENTORY_WRITEOFF',metadata:{
          requestKey:d.requestKey,quantityBase:d.quantityBase,kind:d.kind,reason:d.reason
        }
      }});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    res.status(201).json({message:'تم خصم الكمية وتوثيق السبب وحركات الدفعات دون المساس بالرصيد المحجوز.',...(await summary(productId))});
  }catch(e){fail(e,res,next);}
});

// Image cover and order can be changed ONLY after returning a product to DRAFT.
productManagementRouter.put('/products/:id/photos/order',async(req,res,next)=>{
  const parsed=z.object({photoIds:z.array(idSchema).min(1).max(12)}).safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:'ترتيب الصور غير صحيح.'});return;}
  try{
    const productId=idSchema.parse(req.params.id);
    await prisma.$transaction(async tx=>{
      const product=await tx.product.findFirst({where:{id:productId,isDemo:false},select:{state:true}});
      if(!product)throw new BusinessProblem(404,'المنتج غير موجود.');
      if(product.state!=='DRAFT')throw new BusinessProblem(409,'أوقف نشر المنتج قبل تعديل ترتيب الصور والغلاف، ثم أعد اعتماده.');
      const photos=await tx.productMedia.findMany({
        where:{productId,kind:'PHOTO'},select:{id:true}
      });
      const given=parsed.data.photoIds;
      if(photos.length!==given.length||new Set(given).size!==given.length||
        photos.some(photo=>!given.includes(photo.id)))
        throw new BusinessProblem(409,'تغيرت صور المنتج، حدّث الصفحة ثم أعد ترتيبها.');
      for(const [i,id] of given.entries()){
        await tx.productMedia.update({where:{id},data:{sort:i}});
      }
      await tx.auditLog.create({data:{
        actorId:res.locals.adminId,entityType:'Product',entityId:productId,
        event:'PRODUCT_PHOTOS_REORDERED',metadata:{photoIds:given,coverPhotoId:given[0]}
      }});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    res.json({message:'تم حفظ الترتيب؛ أصبحت الصورة الأولى هي الغلاف. أعد اعتماد المنتج قبل نشره.'});
  }catch(e){fail(e,res,next);}
});

productManagementRouter.delete('/products/:id/photos/:photoId',async(req,res,next)=>{
  try{
    const productId=idSchema.parse(req.params.id),photoId=idSchema.parse(req.params.photoId);
    const deleted=await prisma.$transaction(async tx=>{
      const product=await tx.product.findFirst({where:{id:productId,isDemo:false},select:{state:true}});
      if(!product)throw new BusinessProblem(404,'المنتج غير موجود.');
      if(product.state!=='DRAFT')throw new BusinessProblem(409,'أوقف نشر المنتج قبل حذف صوره.');
      const photo=await tx.productMedia.findFirst({
        where:{id:photoId,productId,kind:'PHOTO'},select:{driveFileId:true}
      });
      if(!photo)throw new BusinessProblem(404,'الصورة غير موجودة.');
      await tx.productMedia.delete({where:{id:photoId}});
      await tx.auditLog.create({data:{
        actorId:res.locals.adminId,entityType:'Product',entityId:productId,
        event:'PRODUCT_PHOTO_REMOVED',metadata:{photoId,hasDriveFile:Boolean(photo.driveFileId)}
      }});
      return photo.driveFileId;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    let cleanupPending=false;
    if(deleted){
      try{await deleteImage(deleted);}
      catch{cleanupPending=true;console.error('Admin media record removed; Google Drive cleanup pending.');}
    }
    res.json({message:cleanupPending?
      'حُذفت الصورة من المتجر؛ تعذر تنظيف نسختها في Google Drive وتحتاج مراجعة لاحقة.':
      'تم حذف الصورة من المنتج وGoogle Drive.',cleanupPending});
  }catch(e){fail(e,res,next);}
});
