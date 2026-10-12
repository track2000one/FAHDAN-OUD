import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Prisma, type BaseUnit, type ProductKind } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';

export const productIntakeRouter = Router();
productIntakeRouter.use(requireOwner);

const categories:Record<ProductKind,{slug:string;nameAr:string;sort:number;baseUnit:BaseUnit}>={
  NATURAL_OUD:{slug:'natural-oud',nameAr:'عود طبيعي',sort:1,baseUnit:'GRAM'},
  TREATED_OUD:{slug:'treated-oud',nameAr:'عود مسقّى',sort:2,baseUnit:'GRAM'},
  BAKHOOR:{slug:'bakhoor',nameAr:'بخور',sort:3,baseUnit:'GRAM'},
  OUD_OIL:{slug:'oud-oil',nameAr:'دهن عود',sort:4,baseUnit:'MILLILITER'},
  FRANKINCENSE:{slug:'frankincense',nameAr:'لبان وعلق ألبان',sort:5,baseUnit:'GRAM'},
  GIFT_BOX:{slug:'gift-box',nameAr:'هدايا وبكجات',sort:6,baseUnit:'PIECE'},
  PERFUME:{slug:'perfume',nameAr:'عطور',sort:7,baseUnit:'MILLILITER'},
  OTHER:{slug:'other-products',nameAr:'منتجات أخرى',sort:8,baseUnit:'PIECE'}
};

const quantity=z.string().trim().regex(/^\d{1,9}(?:\.\d{1,3})?$/,'أدخل كمية بوحدة صحيحة وبحد أقصى ثلاثة كسور')
  .refine(x=>new Prisma.Decimal(x).gt(0),'يجب أن تكون الكمية أكبر من الصفر');
const nonnegativeQuantity=z.string().trim().regex(/^\d{1,9}(?:\.\d{1,3})?$/)
  .refine(x=>new Prisma.Decimal(x).gte(0));
const money=z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/,'استخدم رقمًا ماليًا من منزلتين عشريتين')
  .refine(x=>new Prisma.Decimal(x).gt(0),'المبلغ يجب أن يكون أكبر من الصفر');

const intakeSchema=z.object({
  code:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,22}$/,'رمز الصنف 3 إلى 23 حرفًا لاتينيًا أو رقمًا'),
  nameAr:z.string().trim().min(3).max(140),
  kind:z.nativeEnum({NATURAL_OUD:'NATURAL_OUD',TREATED_OUD:'TREATED_OUD',
    BAKHOOR:'BAKHOOR',OUD_OIL:'OUD_OIL',FRANKINCENSE:'FRANKINCENSE',
    GIFT_BOX:'GIFT_BOX',PERFUME:'PERFUME',OTHER:'OTHER'} as const),
  originCountry:z.string().trim().max(100).default(''),
  originRegion:z.string().trim().max(100).default(''),
  grade:z.string().trim().max(120).default(''),
  scentProfile:z.string().trim().max(500).default(''),
  descriptionAr:z.string().trim().max(1800).default(''),
  projectionScore:z.number().int().min(1).max(5).nullable().default(null),
  longevityScore:z.number().int().min(1).max(5).nullable().default(null),
  supplierName:z.string().trim().min(2).max(160),
  supplierContact:z.string().trim().max(160).default(''),
  receivedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  invoiceReference:z.string().trim().max(100).default(''),
  stockQuantity:quantity,
  landedCostSar:money,
  reorderPoint:nonnegativeQuantity,
  variants:z.array(z.object({
    quantity:quantity,
    priceSar:money,
    compareAtPriceSar:z.union([money,z.literal('')]).default('')
  })).min(1).max(12)
}).superRefine((value,ctx)=>{
  const seen=new Set<string>();
  for(const [i,v] of value.variants.entries()){
    const q=new Prisma.Decimal(v.quantity).toString();
    if(seen.has(q))ctx.addIssue({code:'custom',path:['variants',i,'quantity'],message:'تكرار الحجم'});
    seen.add(q);
    if(v.compareAtPriceSar && new Prisma.Decimal(v.compareAtPriceSar).lte(new Prisma.Decimal(v.priceSar)))
      ctx.addIssue({code:'custom',path:['variants',i,'compareAtPriceSar'],message:'السعر قبل الخصم يجب أن يتجاوز السعر الحالي'});
  }
  if(!value.variants.some(v=>new Prisma.Decimal(v.quantity).lte(new Prisma.Decimal(value.stockQuantity)))) {
    const unit=categories[value.kind].baseUnit==='GRAM'?'غرام':
      categories[value.kind].baseUnit==='MILLILITER'?'ملليلتر':'قطعة';
    ctx.addIssue({code:'custom',path:['variants'],message:
      `حجم البيع يجب ألا يتجاوز المخزون المسجل (${value.stockQuantity} ${unit}). تأكد من إدخال الكمية بوحدة القياس الصحيحة.`});
  }
  const expected=categories[value.kind].baseUnit;
  if(expected==='PIECE' && (new Prisma.Decimal(value.stockQuantity).mod(1).gt(0) ||
     value.variants.some(v=>new Prisma.Decimal(v.quantity).mod(1).gt(0))))
    ctx.addIssue({code:'custom',path:['variants'],message:'القطع يجب أن تكون بأعداد صحيحة'});
});

function label(q:Prisma.Decimal,unit:BaseUnit):string{
  const val=q.toString();
  if(unit==='PIECE')return val==='1'?'قطعة واحدة':val+' قطع';
  if(unit==='MILLILITER')return val+' مل';
  const named:Record<string,string>={'28':'أوقية (28 جم)','125':'ثمن (125 جم)',
    '250':'ربع كيلو (250 جم)','500':'نصف كيلو (500 جم)','1000':'كيلو (1000 جم)'};
  return named[val]||val+' جم';
}

const intakeFieldNames:Record<string,string>={
  code:'رمز الصنف',nameAr:'اسم المنتج بالعربية',kind:'قسم المنتج',
  originCountry:'بلد المنشأ',originRegion:'منطقة المنشأ',grade:'الدرجة',
  scentProfile:'وصف الرائحة',descriptionAr:'وصف المنتج',
  projectionScore:'قوة الفوحان',longevityScore:'مستوى الثبات',
  supplierName:'اسم المورد',supplierContact:'بيانات التواصل مع المورد',
  receivedAt:'تاريخ استلام المخزون',invoiceReference:'مرجع فاتورة الشراء',
  stockQuantity:'الكمية المشتراة',landedCostSar:'إجمالي تكلفة الشراء',
  reorderPoint:'حد تنبيه قرب النفاد',variants:'أحجام البيع'
};
const variantFieldNames:Record<string,string>={
  quantity:'الحجم',priceSar:'سعر البيع',compareAtPriceSar:'السعر قبل الخصم'
};
function explainIntakeIssue(issue:z.ZodIssue){
  const parts=issue.path.map(String);
  const field=parts.join('.');
  const inVariant=parts[0]==='variants'&&/^\d+$/.test(parts[1]||'');
  const label=inVariant?
    `حجم البيع رقم ${Number(parts[1])+1} — ${variantFieldNames[parts[2]]||'البيانات'}`:
    intakeFieldNames[parts[0]]||'بيانات المنتج';
  let detail=issue.message;
  if(issue.code==='invalid_type')detail='القيمة المطلوبة غير مدخلة أو ليست من النوع الصحيح.';
  else if(issue.code==='too_small')detail='القيمة أصغر من الحد الأدنى المطلوب.';
  else if(issue.code==='too_big')detail='القيمة تتجاوز الحد المسموح.';
  else if(!/[\u0600-\u06FF]/.test(detail))detail='البيانات غير صالحة؛ راجع القيمة المدخلة.';
  return {field,label,message:`${label}: ${detail}`};
}

productIntakeRouter.post('/products',async(req,res,next)=>{
  const parsed=intakeSchema.safeParse(req.body);
  if(!parsed.success){
    const errors=parsed.error.issues.map(explainIntakeIssue);
    res.status(400).json({
      error:'تعذر حفظ المنتج. راجع الحقول المحددة أدناه ثم أعد المحاولة.',
      validationErrors:errors
    });
    return;
  }
  const d=parsed.data,details=categories[d.kind],unit=details.baseUnit;
  // Prices and stock must reflect actual purchasing; create as DRAFT until a photo is uploaded.
  const stock=new Prisma.Decimal(d.stockQuantity);
  const totalCost=new Prisma.Decimal(d.landedCostSar);
  const unitCost=totalCost.div(stock).toDecimalPlaces(6);
  const date=new Date(d.receivedAt+'T12:00:00.000Z');
  if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==d.receivedAt||
     date.getTime()>Date.now()+24*60*60*1000){
    res.status(400).json({error:'تاريخ الشراء غير صحيح أو يقع في المستقبل.'});return;
  }
  try{
    const result=await prisma.$transaction(async tx=>{
      const category=await tx.category.upsert({
        where:{slug:details.slug},
        create:{slug:details.slug,nameAr:details.nameAr,sort:details.sort},
        update:{}
      });
      const existingSupplier=await tx.supplier.findFirst({
        where:{name:{equals:d.supplierName,mode:'insensitive'}},
        select:{id:true}
      });
      const supplier=existingSupplier||await tx.supplier.create({
        data:{name:d.supplierName,contact:d.supplierContact||null},
        select:{id:true}
      });
      const product=await tx.product.create({
        data:{
          slug:'fhd-'+d.code.toLowerCase(),nameAr:d.nameAr,kind:d.kind,
          categoryId:category.id,baseUnit:unit,state:'DRAFT',isDemo:false,
          allowPreorder:false,originCountry:d.originCountry||null,
          originRegion:d.originRegion||null,grade:d.grade||null,
          scentProfile:d.scentProfile||null,descriptionAr:d.descriptionAr||null,
          projectionScore:d.projectionScore,longevityScore:d.longevityScore,
          balance:{create:{onHandBase:stock,reservedBase:0,reorderPoint:new Prisma.Decimal(d.reorderPoint)}},
          variants:{create:d.variants.map(v=>{
            const weight=new Prisma.Decimal(v.quantity);
            return {
              sku:'FHD-'+d.code+'-'+weight.toString().replace('.','P'),
              labelAr:label(weight,unit),quantityBase:weight,
              priceSar:new Prisma.Decimal(v.priceSar),
              compareAtPriceSar:v.compareAtPriceSar?new Prisma.Decimal(v.compareAtPriceSar):null,
              active:true
            };
          })}
        },
        select:{id:true,nameAr:true,slug:true}
      });
      const purchase=await tx.purchase.create({
        data:{
          supplierId:supplier.id,invoiceReference:d.invoiceReference||null,receivedAt:date,
          currency:'SAR',inboundExtrasSar:0,
          lines:{create:{productId:product.id,quantityBase:stock,totalCostSar:totalCost}}
        },
        select:{id:true,lines:{select:{id:true}}}
      });
      const lot=await tx.inventoryLot.create({
        data:{
          lotNumber:'FHD-LOT-'+randomUUID(),productId:product.id,
          purchaseLineId:purchase.lines[0].id,acquiredBase:stock,
          remainingBase:stock,unitCostSar:unitCost
        },
        select:{id:true}
      });
      await tx.stockMovement.create({
        data:{
          productId:product.id,lotId:lot.id,kind:'PURCHASE_RECEIPT',
          deltaBase:stock,unitCostSar:unitCost,sourceRef:purchase.id,
          idempotencyKey:'purchase-'+purchase.lines[0].id,
          reason:'استلام المخزون الأولي للمنتج'
        }
      });
      return product;
    });
    res.status(201).json({product:result,message:'تم إنشاء المنتج كمسودة وتسجيل الاستلام والتكلفة في المستودع.'});
  }catch(err){
    if(err instanceof Prisma.PrismaClientKnownRequestError && err.code==='P2002'){
      res.status(409).json({error:'رمز الصنف مستخدم بالفعل؛ اختر رمزًا مختلفًا.'});return;
    }
    next(err);
  }
});

productIntakeRouter.patch('/products/:id/publishing',async(req,res,next)=>{
  const parsed=z.object({state:z.enum(['ACTIVE','DRAFT'])}).safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:'حالة النشر غير صحيحة.'});return;}
  try{
    const p=await prisma.product.findUnique({
      where:{id:req.params.id},
      select:{
        id:true,state:true,isDemo:true,
        variants:{where:{active:true},select:{quantityBase:true,priceSar:true}},
        media:{where:{kind:'PHOTO'},select:{id:true},take:1},
        balance:{select:{onHandBase:true,reservedBase:true}}
      }
    });
    if(!p||p.isDemo){res.status(404).json({error:'المنتج الفعلي غير موجود.'});return;}
    if(parsed.data.state==='ACTIVE'){
      const available=(p.balance?.onHandBase||new Prisma.Decimal(0))
        .sub(p.balance?.reservedBase||new Prisma.Decimal(0));
      if(p.media.length===0||available.lte(0)||
        !p.variants.some(v=>v.priceSar.gt(0)&&v.quantityBase.lte(available))){
        res.status(409).json({error:'للنشر يلزم صورة مرفوعة إلى Google Drive ورصيد متاح وسعر وحجم قابل للبيع.'});
        return;
      }
    }
    const product=await prisma.product.update({
      where:{id:p.id},
      data:{state:parsed.data.state},
      select:{id:true,state:true,slug:true}
    });
    res.json({product,message:product.state==='ACTIVE'?'تم نشر المنتج في المتجر.':'تم إرجاع المنتج إلى المسودات.'});
  }catch(err){next(err);}
});
