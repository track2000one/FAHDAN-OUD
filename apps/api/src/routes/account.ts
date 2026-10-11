import { Router, type RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { deliveryFromOrderSnapshot } from '../lib/delivery.js';

// All routes below require a verified CUSTOMER JWT. Admin and other roles are rejected.
export const accountRouter = Router();
accountRouter.use(rateLimit({ windowMs:15*60*1000, limit:120, standardHeaders:'draft-7', legacyHeaders:false }));

export const requireCustomer: RequestHandler = async (req,res,next) => {
  try {
    const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if(!token){res.status(401).json({error:'يرجى تسجيل الدخول إلى حسابك.'});return;}
    const payload=jwt.verify(token,process.env.JWT_SECRET!,{audience:'fahdan-customers'}) as JwtPayload;
    if(typeof payload.sub!=='string'||payload.purpose!=='customer')throw new Error('Invalid customer token');
    const user=await prisma.user.findUnique({where:{id:payload.sub},select:{
      id:true,role:true,enabled:true,emailVerifiedAt:true
    }});
    if(!user||user.role!=='CUSTOMER'||!user.enabled||!user.emailVerifiedAt)throw new Error('Unauthorized');
    res.locals.customerId=user.id;
    next();
  } catch {res.status(401).json({error:'انتهت جلسة الحساب؛ يرجى تسجيل الدخول مجددًا.'});}
};
accountRouter.use(requireCustomer);

const profileSchema=z.object({
  name:z.string().trim().min(2).max(80),
  phone:z.union([z.string().trim().regex(/^\+?[0-9][0-9 -]{7,19}$/),z.literal('')])
});
const addressSchema=z.object({
  label:z.string().trim().min(2).max(40),
  recipientName:z.string().trim().min(2).max(80),
  phone:z.string().trim().regex(/^\+?[0-9][0-9 -]{7,19}$/),
  city:z.string().trim().min(2).max(80),
  district:z.string().trim().min(2).max(100),
  street:z.string().trim().min(2).max(160),
  building:z.string().trim().max(50).default(''),
  postalCode:z.string().trim().max(12).default(''),
  additionalNumber:z.string().trim().max(15).default(''),
  isDefault:z.boolean().default(false),
  latitude:z.number().finite().min(-90).max(90).nullable().default(null),
  longitude:z.number().finite().min(-180).max(180).nullable().default(null)
}).refine(value=>(value.latitude===null)===(value.longitude===null),{
  message:'حدد إحداثيات الموقع كاملة أو اترك الخريطة دون اختيار.'
});
const addressId=z.string().min(1).max(64);
const addressFields={id:true,label:true,recipientName:true,phone:true,city:true,district:true,
  street:true,building:true,postalCode:true,additionalNumber:true,isDefault:true,
  latitude:true,longitude:true} as const;

accountRouter.get('/profile',async(_req,res,next)=>{
  try {
    const user=await prisma.user.findUniqueOrThrow({where:{id:res.locals.customerId},select:{
      id:true,name:true,email:true,phone:true,emailVerifiedAt:true,createdAt:true
    }});
    res.setHeader('Cache-Control','no-store');
    res.json({user});
  }catch(e){next(e);}
});

accountRouter.patch('/profile',async(req,res,next)=>{
  try {
    const parsed=profileSchema.safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:'تحقق من الاسم ورقم الهاتف المدخل.'});return;}
    const user=await prisma.user.update({where:{id:res.locals.customerId},data:{
      name:parsed.data.name,phone:parsed.data.phone || null
    },select:{id:true,name:true,email:true,phone:true,emailVerifiedAt:true,createdAt:true}});
    res.setHeader('Cache-Control','no-store');
    res.json({user});
  }catch(e){next(e);}
});

accountRouter.get('/addresses',async(_req,res,next)=>{
  try {
    const addresses=await prisma.customerAddress.findMany({
      where:{userId:res.locals.customerId},select:addressFields,
      orderBy:[{isDefault:'desc'},{createdAt:'desc'}]
    });
    res.setHeader('Cache-Control','no-store');
    res.json({addresses});
  }catch(e){next(e);}
});

accountRouter.post('/addresses',async(req,res,next)=>{
  try {
    const parsed=addressSchema.safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:'تحقق من جميع الحقول المطلوبة في العنوان.'});return;}
    const userId=res.locals.customerId as string;
    const address=await prisma.$transaction(async(tx)=>{
      const count=await tx.customerAddress.count({where:{userId}});
      if(count>=10)return null;
      const defaultRequested=count===0 || parsed.data.isDefault;
      if(defaultRequested)await tx.customerAddress.updateMany({where:{userId,isDefault:true},data:{isDefault:false}});
      return tx.customerAddress.create({data:{
        ...parsed.data,building:parsed.data.building||null,postalCode:parsed.data.postalCode||null,
        additionalNumber:parsed.data.additionalNumber||null,isDefault:defaultRequested,userId
      },select:addressFields});
    });
    if(!address){res.status(400).json({error:'يمكن حفظ 10 عناوين بحد أقصى.'});return;}
    res.status(201).json({address});
  }catch(e){next(e);}
});

accountRouter.put('/addresses/:id',async(req,res,next)=>{
  try {
    const id=addressId.safeParse(req.params.id),parsed=addressSchema.safeParse(req.body);
    if(!id.success||!parsed.success){res.status(400).json({error:'بيانات العنوان غير صحيحة.'});return;}
    const userId=res.locals.customerId as string;
    const saved=await prisma.$transaction(async tx=>{
      const prior=await tx.customerAddress.findFirst({where:{id:id.data,userId}});
      if(!prior)return null;
      if(parsed.data.isDefault)await tx.customerAddress.updateMany({where:{userId,isDefault:true},data:{isDefault:false}});
      return tx.customerAddress.update({where:{id:id.data},data:{
        ...parsed.data,building:parsed.data.building||null,postalCode:parsed.data.postalCode||null,
        additionalNumber:parsed.data.additionalNumber||null,
        // Editing a default address never removes its default status unless another is selected.
        isDefault:prior.isDefault || parsed.data.isDefault
      },select:addressFields});
    });
    if(!saved){res.status(404).json({error:'العنوان غير موجود.'});return;}
    res.json({address:saved});
  }catch(e){next(e);}
});

accountRouter.post('/addresses/:id/default',async(req,res,next)=>{
  try {
    const parsed=addressId.safeParse(req.params.id);
    if(!parsed.success){res.status(400).json({error:'العنوان غير صحيح.'});return;}
    const userId=res.locals.customerId as string;
    const result=await prisma.$transaction(async tx=>{
      const addr=await tx.customerAddress.findFirst({where:{id:parsed.data,userId},select:{id:true}});
      if(!addr)return false;
      await tx.customerAddress.updateMany({where:{userId,isDefault:true},data:{isDefault:false}});
      await tx.customerAddress.update({where:{id:addr.id},data:{isDefault:true}});
      return true;
    });
    if(!result){res.status(404).json({error:'العنوان غير موجود.'});return;}
    res.json({message:'تم تعيين العنوان الافتراضي.'});
  }catch(e){next(e);}
});

accountRouter.delete('/addresses/:id',async(req,res,next)=>{
  try {
    const parsed=addressId.safeParse(req.params.id);
    if(!parsed.success){res.status(400).json({error:'العنوان غير صحيح.'});return;}
    const userId=res.locals.customerId as string;
    const deleted=await prisma.$transaction(async tx=>{
      const address=await tx.customerAddress.findFirst({where:{id:parsed.data,userId}});
      if(!address)return false;
      await tx.customerAddress.delete({where:{id:address.id}});
      if(address.isDefault){
        const nextAddress=await tx.customerAddress.findFirst({where:{userId},orderBy:{createdAt:'desc'}});
        if(nextAddress)await tx.customerAddress.update({where:{id:nextAddress.id},data:{isDefault:true}});
      }
      return true;
    });
    if(!deleted){res.status(404).json({error:'العنوان غير موجود.'});return;}
    res.json({message:'تم حذف العنوان.'});
  }catch(e){next(e);}
});

accountRouter.get('/orders',async(_req,res,next)=>{
  try {
    const orders=await prisma.order.findMany({
      where:{customerId:res.locals.customerId},
      orderBy:{createdAt:'desc'},take:50,
      select:{
        id:true,orderNumber:true,state:true,totalSar:true,createdAt:true,addressSnapshot:true,
        items:{select:{id:true,productNameAr:true,quantityItems:true,unitPriceSar:true,totalPriceSar:true}},
        shipments:{select:{state:true,carrier:true,trackingCode:true}}
      }
    });
    // Never expose internal costs or other customers' orders.
    res.setHeader('Cache-Control','no-store');
    res.json({orders:orders.map(order=>({
      ...order,addressSnapshot:undefined,delivery:deliveryFromOrderSnapshot(order.addressSnapshot),totalSar:order.totalSar.toString(),
      items:order.items.map(item=>({...item,unitPriceSar:item.unitPriceSar.toString(),totalPriceSar:item.totalPriceSar.toString()}))
    }))});
  }catch(e){next(e);}
});
