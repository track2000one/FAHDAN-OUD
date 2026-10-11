import { createHmac } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireCustomer } from './account.js';

export const checkoutRouter = Router();
checkoutRouter.use(rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}));
checkoutRouter.use(requireCustomer);

const itemSchema=z.object({
  variantId:z.string().min(1).max(100),
  quantity:z.number().int().min(1).max(20)
});
const itemsSchema=z.array(itemSchema).min(1).max(20).superRefine((items,ctx)=>{
  const seen=new Set<string>();
  items.forEach((item,i)=>{
    if(seen.has(item.variantId))ctx.addIssue({code:z.ZodIssueCode.custom,path:[i,'variantId'],message:'صنف مكرر'});
    seen.add(item.variantId);
  });
});
const reviewSchema=z.object({
  addressId:z.string().min(1).max(100),
  items:itemsSchema,
  requestKey:z.string().uuid(),
  acknowledged:z.literal(true)
});

class CheckoutIssue extends Error{
  constructor(public status:number,message:string){super(message);}
}

async function calculate(db:Prisma.TransactionClient,items:z.infer<typeof itemsSchema>){
  const variants=await db.productVariant.findMany({
    where:{id:{in:items.map(i=>i.variantId)}},
    select:{
      id:true,sku:true,labelAr:true,quantityBase:true,priceSar:true,active:true,
      product:{select:{
        id:true,nameAr:true,state:true,isDemo:true,allowPreorder:true,
        balance:{select:{onHandBase:true,reservedBase:true}}
      }}
    }
  });
  const byId=new Map(variants.map(v=>[v.id,v]));
  const used=new Map<string,Prisma.Decimal>();
  const lines=items.map(entry=>{
    const variant=byId.get(entry.variantId);
    if(!variant||!variant.active||variant.product.state!=='ACTIVE'||variant.product.isDemo)
      throw new CheckoutIssue(409,'أحد الأصناف غير متاح للبيع الفعلي. يرجى تحديث السلة.');
    if(variant.product.allowPreorder)
      throw new CheckoutIssue(409,'الطلب المسبق غير مفعل حاليًا؛ يرجى اختيار صنف متوفر.');
    const quantityBase=variant.quantityBase.mul(entry.quantity);
    used.set(variant.product.id,(used.get(variant.product.id)||new Prisma.Decimal(0)).add(quantityBase));
    const amount=variant.priceSar.mul(entry.quantity);
    return {
      productId:variant.product.id,variantId:variant.id,
      productNameAr:variant.product.nameAr,sku:variant.sku,label:variant.labelAr,
      eachBase:variant.quantityBase,quantityItems:entry.quantity,
      unitPriceSar:variant.priceSar,totalPriceSar:amount,
      balance:variant.product.balance
    };
  });
  for(const line of lines){
    const available=(line.balance?.onHandBase||new Prisma.Decimal(0))
      .sub(line.balance?.reservedBase||new Prisma.Decimal(0));
    if(available.lt(used.get(line.productId)||new Prisma.Decimal(0)))
      throw new CheckoutIssue(409,`الكمية المطلوبة من «${line.productNameAr}» تتجاوز المتاح. حدّث السلة.`);
  }
  const subtotal=lines.reduce((sum,item)=>sum.add(item.totalPriceSar),new Prisma.Decimal(0));
  return {lines,subtotal};
}

function publicQuote(result:Awaited<ReturnType<typeof calculate>>){
  return {
    items:result.lines.map(line=>({
      variantId:line.variantId,sku:line.sku,name:line.productNameAr,
      label:line.label,quantity:line.quantityItems,
      unitPriceSar:line.unitPriceSar.toFixed(2),
      lineTotalSar:line.totalPriceSar.toFixed(2)
    })),
    subtotalSar:result.subtotal.toFixed(2),
    shippingSar:null,
    taxSar:null,
    amountDueSar:null,
    preliminary:true,
    notice:'المبلغ المعروض للمنتجات فقط؛ رسوم الشحن والضرائب وأي مبلغ نهائي تُحدّد بعد مراجعة المتجر. لا يتم تحصيل أي دفعة.'
  };
}

checkoutRouter.post('/quote',async(req,res,next)=>{
  try{
    const data=z.object({items:itemsSchema}).safeParse(req.body);
    if(!data.success){res.status(400).json({error:'راجع محتويات السلة والكميات المطلوبة.'});return;}
    const result=await calculate(prisma,data.data.items);
    res.setHeader('Cache-Control','no-store');
    res.json(publicQuote(result));
  }catch(e){
    if(e instanceof CheckoutIssue){res.status(e.status).json({error:e.message});return;}
    next(e);
  }
});

checkoutRouter.post('/request',rateLimit({
  windowMs:60*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false
}),async(req,res,next)=>{
  try{
    const data=reviewSchema.safeParse(req.body);
    if(!data.success){res.status(400).json({error:'تحقق من عنوان التسليم والسلة والموافقة على أن الطلب مبدئي وغير مدفوع.'});return;}
    const userId=res.locals.customerId as string;
    const {requestKey,addressId,items}=data.data;
    // An existing UNIQUE orderNumber guarantees idempotency without changing
    // constraints on the production order table.
    const orderNumber='FD-'+createHmac('sha256',process.env.JWT_SECRET!)
      .update(userId+':'+requestKey).digest('hex').slice(0,20).toUpperCase();
    const existing=await prisma.order.findUnique({where:{orderNumber},
      select:{customerId:true,orderNumber:true,state:true}});
    if(existing){
      if(existing.customerId!==userId){res.status(409).json({error:'تعذر تسجيل الطلب؛ حاول إعادة تحميل الصفحة.'});return;}
      res.json({orderNumber:existing.orderNumber,state:existing.state,duplicate:true});
      return;
    }

    // This is a PRELIMINARY, NON-PAYABLE request only: no payment or stock
    // reservation occurs, and shipping/tax are deliberately pending merchant review.
    const created=await prisma.$transaction(async tx=>{
      const address=await tx.customerAddress.findFirst({where:{id:addressId,userId}});
      if(!address)throw new CheckoutIssue(400,'اختر عنوانًا محفوظًا في حسابك.');
      const lat=address.latitude,lng=address.longitude;
      if(lat===null||lng===null||!Number.isFinite(lat)||!Number.isFinite(lng)||
         Math.abs(lat)>90||Math.abs(lng)>180)
        throw new CheckoutIssue(400,'حدد موقع التوصيل على الخريطة واحفظ العنوان أولًا.');
      const {lines,subtotal}=await calculate(tx,items);
      return tx.order.create({
        data:{
          orderNumber,
          customerId:userId,
          addressSnapshot:{
            recipientName:address.recipientName,phone:address.phone,
            city:address.city,district:address.district,street:address.street,
            building:address.building,postalCode:address.postalCode,
            additionalNumber:address.additionalNumber,latitude:lat,longitude:lng,
            pricingNote:'PRELIMINARY_SHIPPING_AND_TAX_PENDING'
          },
          state:'AWAITING_REVIEW',
          subtotalSar:subtotal,
          // Placeholder for database accounting fields ONLY. Never display as "free shipping".
          shippingSar:new Prisma.Decimal(0),
          taxSar:new Prisma.Decimal(0),
          totalSar:subtotal,
          items:{create:lines.map(line=>({
            variantId:line.variantId,
            productNameAr:line.productNameAr,
            skuSnapshot:line.sku,
            quantityItems:line.quantityItems,
            eachBase:line.eachBase,
            unitPriceSar:line.unitPriceSar,
            totalPriceSar:line.totalPriceSar
          }))}
        },
        select:{orderNumber:true,state:true}
      });
    });
    res.status(201).json({...created,duplicate:false});
  }catch(e){
    if(e instanceof CheckoutIssue){res.status(e.status).json({error:e.message});return;}
    // Unique request key can be raced by repeated clicks or network retries.
    if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002'&&
      typeof req.body?.requestKey==='string'){
      const userId=res.locals.customerId as string;
      const orderNumber='FD-'+createHmac('sha256',process.env.JWT_SECRET!)
        .update(userId+':'+req.body.requestKey).digest('hex').slice(0,20).toUpperCase();
      const existing=await prisma.order.findUnique({where:{orderNumber},
        select:{customerId:true,orderNumber:true,state:true}});
      if(existing && existing.customerId===res.locals.customerId){
        res.json({orderNumber:existing.orderNumber,state:existing.state,duplicate:true});return;
      }
    }
    next(e);
  }
});
