import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';

export const merchantSettingsRouter=Router();
export const shippingInfoRouter=Router();
merchantSettingsRouter.use(requireOwner);

const billingKey='FAHDAN_BILLING_PROFILE_V1';
const shippingKey='FAHDAN_DELIVERY_RATES_V1';
const paymentKey='FAHDAN_PAYMENT_READINESS_V1';
const supportedPaymentMethods=['MADA','VISA_MASTERCARD','APPLE_PAY','BANK_TRANSFER','CASH_ON_DELIVERY'] as const;

export const billingSchema=z.object({
  legalNameAr:z.string().trim().max(160),
  tradeNameAr:z.string().trim().max(160),
  commercialRegistration:z.string().trim().regex(/^(?:\d{10}|)$/,'رقم السجل التجاري يتكون من 10 أرقام، أو اتركه فارغًا.'),
  taxStatus:z.enum(['UNCONFIRMED','REGISTERED','NOT_REGISTERED']),
  vatNumber:z.string().trim().regex(/^(?:\d{15}|)$/,'الرقم الضريبي يجب أن يتكون من 15 رقمًا أو يترك فارغًا.'),
  zatcaPhase:z.enum(['UNDETERMINED','PHASE1','PHASE2']),
  nationalAddress:z.string().trim().max(350),
  customerServiceEmail:z.union([z.literal(''),z.string().trim().email().max(160)]),
  customerServicePhone:z.string().trim().max(30),
  documentNotes:z.string().trim().max(600),
  reviewedByMerchant:z.boolean()
}).superRefine((d,ctx)=>{
  if(d.taxStatus==='REGISTERED'&&!/^\d{15}$/.test(d.vatNumber))
    ctx.addIssue({code:'custom',path:['vatNumber'],message:'منشأة مسجلة في ضريبة القيمة المضافة تحتاج الرقم الضريبي الصحيح.'});
  if(d.taxStatus!=='REGISTERED'&&d.vatNumber)
    ctx.addIssue({code:'custom',path:['vatNumber'],message:'لا تسجل رقمًا ضريبيًا ما لم تكن المنشأة مسجلة بالفعل.'});
});
export type BillingSettings=z.infer<typeof billingSchema>;
export const shippingSchema=z.object({
  policyPublished:z.boolean(),
  rateEntries:z.array(z.object({
    city:z.string().trim().min(2).max(80),
    feeSar:z.string().trim().regex(/^\d{1,7}(?:\.\d{1,2})?$/,'رسم التوصيل يجب أن يكون رقمًا بالريال حتى منزلتين.'),
    etaText:z.string().trim().max(130)
  })).max(50),
  shippingPolicy:z.string().trim().max(2500),
  specialNotice:z.string().trim().max(500)
}).superRefine((d,ctx)=>{
  const citySet=new Set<string>();
  d.rateEntries.forEach((r,i)=>{
    const key=r.city.normalize('NFKC').trim().toLowerCase();
    if(citySet.has(key))ctx.addIssue({code:'custom',path:['rateEntries',i,'city'],message:'المدينة مكررة.'});
    citySet.add(key);
  });
  if(d.policyPublished){
    if(!d.rateEntries.length)ctx.addIssue({code:'custom',path:['rateEntries'],message:'أضف مدينة ورسومًا فعلية قبل نشر السياسة.'});
    if(d.shippingPolicy.length<30)ctx.addIssue({code:'custom',path:['shippingPolicy'],message:'اشرح شروط التوصيل والمدة وآلية التواصل قبل نشر الأسعار.'});
  }
});
export type ShippingSettings=z.infer<typeof shippingSchema>;
const paymentSchema=z.object({
  preferredProvider:z.enum(['UNDECIDED','MOYASAR','TAP','HYPERPAY','OTHER']),
  preferredMethods:z.array(z.enum(supportedPaymentMethods)).max(5),
  agreementReviewed:z.boolean(),
  readinessNotes:z.string().trim().max(1400)
});
export type PaymentSettings=z.infer<typeof paymentSchema>;

const defaultBilling:BillingSettings={
  legalNameAr:'',tradeNameAr:'',commercialRegistration:'',taxStatus:'UNCONFIRMED',
  vatNumber:'',zatcaPhase:'UNDETERMINED',nationalAddress:'',
  customerServiceEmail:'',customerServicePhone:'',documentNotes:'',reviewedByMerchant:false
};
const defaultShipping:ShippingSettings={
  policyPublished:false,rateEntries:[],shippingPolicy:'',specialNotice:''
};
const defaultPayments:PaymentSettings={
  preferredProvider:'UNDECIDED',preferredMethods:[],agreementReviewed:false,readinessNotes:''
};

async function readOne<T>(key:string,schema:z.ZodType<T>,defaults:T):Promise<T>{
  const record=await prisma.siteSetting.findUnique({where:{key},select:{value:true}});
  if(!record)return defaults;
  const parsed=schema.safeParse(record.value);
  return parsed.success?parsed.data:defaults;
}
export const getBillingSettings=()=>readOne(billingKey,billingSchema,defaultBilling);
export const getShippingSettings=()=>readOne(shippingKey,shippingSchema,defaultShipping);
export const getPaymentSettings=()=>readOne(paymentKey,paymentSchema,defaultPayments);
const fieldErrors=(error:z.ZodError)=>error.issues.map(x=>({
  field:x.path.join('.'),message:x.message
}));
function canDisplayShipping(data:ShippingSettings){
  return data.policyPublished&&data.rateEntries.length>0&&data.shippingPolicy.length>=30;
}
function publicShipping(data:ShippingSettings){
  return {
    configured:canDisplayShipping(data),
    rates:canDisplayShipping(data)?data.rateEntries:[],
    policy:canDisplayShipping(data)?data.shippingPolicy:null,
    specialNotice:canDisplayShipping(data)?data.specialNotice:null,
    notice:canDisplayShipping(data)
      ?'الأسعار المنشورة استرشادية حسب المدينة؛ تُراجع المنطقة والعنوان والتكلفة النهائية قبل تأكيد أي شراء. الطلبات الحالية مبدئية وغير مدفوعة.'
      :'لم تُعتمد أسعار التوصيل للعرض بعد. يتم تحديدها من المتجر قبل تأكيد البيع.'
  };
}

merchantSettingsRouter.get('/billing',async(_req,res,next)=>{
  try{
    res.setHeader('Cache-Control','no-store');
    res.json({settings:await getBillingSettings(),
      compliance:{fatoorahConnected:false,taxInvoiceIssuingEnabled:false,
        notice:'حفظ بيانات المنشأة لا يعني تفعيل الربط مع زاتكا أو إصدار فاتورة ضريبية.'}});
  }catch(e){next(e);}
});
merchantSettingsRouter.put('/billing',async(req,res,next)=>{
  const parsed=billingSchema.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:'راجع بيانات المنشأة والرقم الضريبي.',details:fieldErrors(parsed.error)});return;}
  try{
    await prisma.$transaction(async tx=>{
      await tx.siteSetting.upsert({
        where:{key:billingKey},create:{key:billingKey,value:parsed.data as Prisma.InputJsonValue},
        update:{value:parsed.data as Prisma.InputJsonValue}
      });
      await tx.auditLog.create({data:{
        actorId:res.locals.adminId,entityType:'SiteSetting',entityId:billingKey,
        event:'BILLING_PROFILE_UPDATED',
        metadata:{taxStatus:parsed.data.taxStatus,zatcaPhase:parsed.data.zatcaPhase,
          reviewedByMerchant:parsed.data.reviewedByMerchant,hasVatNumber:!!parsed.data.vatNumber}
      }});
    });
    res.json({message:'حُفظت بيانات المنشأة في لوحة المدير، ولم تُفعَّل فواتير زاتكا.',settings:parsed.data});
  }catch(e){next(e);}
});
merchantSettingsRouter.get('/shipping',async(_req,res,next)=>{
  try{res.setHeader('Cache-Control','no-store');res.json({settings:await getShippingSettings()});}
  catch(e){next(e);}
});
merchantSettingsRouter.put('/shipping',async(req,res,next)=>{
  const parsed=shippingSchema.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:'راجع قائمة المدن ورسومها وشروط التوصيل.',
    details:fieldErrors(parsed.error)});return;}
  try{
    await prisma.$transaction(async tx=>{
      await tx.siteSetting.upsert({where:{key:shippingKey},
        create:{key:shippingKey,value:parsed.data as Prisma.InputJsonValue},
        update:{value:parsed.data as Prisma.InputJsonValue}});
      await tx.auditLog.create({data:{
        actorId:res.locals.adminId,entityType:'SiteSetting',entityId:shippingKey,
        event:parsed.data.policyPublished?'SHIPPING_POLICY_PUBLISHED':'SHIPPING_SETTINGS_SAVED',
        metadata:{published:parsed.data.policyPublished,cityCount:parsed.data.rateEntries.length}
      }});
    });
    res.json({message:parsed.data.policyPublished?
      'نُشرت رسوم التوصيل الاسترشادية وشروطها. لم تتغير أسعار أو حالات الطلبات السابقة.':
      'حُفظت مسودة التوصيل؛ لم تُنشر للعميل.',settings:parsed.data});
  }catch(e){next(e);}
});
merchantSettingsRouter.get('/payments',async(_req,res,next)=>{
  try{res.setHeader('Cache-Control','no-store');res.json({settings:await getPaymentSettings(),
    gatewayConnected:false,liveCollectionEnabled:false,
    notice:'اختيار مزود أو طريقة دفع هنا لا يفعل التحصيل أو حفظ مفاتيح دفع. الربط الفعلي مرحلة منفصلة.'});}
  catch(e){next(e);}
});
merchantSettingsRouter.put('/payments',async(req,res,next)=>{
  const parsed=paymentSchema.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:'تحقق من اختيار مزود الدفع والطرق المقترحة.'});return;}
  try{
    await prisma.$transaction(async tx=>{
      await tx.siteSetting.upsert({where:{key:paymentKey},
        create:{key:paymentKey,value:parsed.data as Prisma.InputJsonValue},
        update:{value:parsed.data as Prisma.InputJsonValue}});
      await tx.auditLog.create({data:{
        actorId:res.locals.adminId,entityType:'SiteSetting',entityId:paymentKey,
        event:'PAYMENT_PREFERENCES_UPDATED',metadata:{
          preferredProvider:parsed.data.preferredProvider,
          preferredMethods:parsed.data.preferredMethods,agreementReviewed:parsed.data.agreementReviewed
        }
      }});
    });
    res.json({settings:parsed.data,message:'حُفظت خيارات الدفع للتهيئة فقط؛ لم يُفعّل تحصيل الأموال.'});
  }catch(e){next(e);}
});

// Deliberately public only for APPROVED city fees. All sensitive billing/payment
// information stays confined to the manager routes above.
shippingInfoRouter.get('/shipping-policy',async(_req,res,next)=>{
  try{res.setHeader('Cache-Control','public,max-age=60');
    res.json(publicShipping(await getShippingSettings()));}
  catch(e){next(e);}
});
shippingInfoRouter.post('/shipping-estimate',async(req,res,next)=>{
  const parsed=z.object({city:z.string().trim().min(2).max(80)}).safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:'اسم المدينة غير صحيح.'});return;}
  try{
    const data=await getShippingSettings(),visible=publicShipping(data);
    const match=visible.rates.find(r=>r.city.normalize('NFKC').trim().toLowerCase()===
      parsed.data.city.normalize('NFKC').trim().toLowerCase());
    res.setHeader('Cache-Control','no-store');
    res.json({city:parsed.data.city,estimateSar:match?.feeSar||null,etaText:match?.etaText||null,
      confirmed:false,notice:match?
        'التكلفة المعروضة تقديرية وغير مُحصّلة؛ يلزم مراجعة العنوان واعتماد الإجمالي النهائي.':
        'لا توجد تعرفة منشورة لهذه المدينة؛ يحدد المتجر الرسوم قبل تأكيد الطلب.'});
  }catch(e){next(e);}
});
