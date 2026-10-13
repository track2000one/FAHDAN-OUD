import { Router } from 'express';
import { Prisma, type ReturnReason, type ReturnRequestStatus } from '@prisma/client';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireCustomer } from './account.js';
import { requireOwner } from '../lib/auth.js';

export const returnsCustomerRouter=Router();
export const returnsAdminRouter=Router();
returnsCustomerRouter.use(rateLimit({windowMs:60*60*1000,limit:25,standardHeaders:'draft-7',legacyHeaders:false}));
returnsCustomerRouter.use(requireCustomer);
returnsAdminRouter.use(requireOwner);

const requestSchema=z.object({
  orderItemId:z.string().min(1).max(120),
  quantity:z.number().int().min(1).max(100),
  kind:z.enum(['RETURN','EXCHANGE']),
  reason:z.enum(['CHANGED_MIND','WRONG_ITEM','DAMAGED','DEFECTIVE','NOT_AS_DESCRIBED','OTHER']),
  explanation:z.string().trim().min(15).max(1400),
  itemOpened:z.boolean()
});
const customerReply=z.object({explanation:z.string().trim().min(15).max(1400)});
const decisionSchema=z.object({
  status:z.enum(['NEEDS_INFORMATION','APPROVED','REJECTED','ITEM_RECEIVED']),
  note:z.string().trim().min(10).max(1200)
});
const idOk=(id:string)=>id.length>=1&&id.length<=120;
const responseSelect={
  id:true,customerId:true,orderId:true,orderItemId:true,kind:true,
  reason:true,quantity:true,explanation:true,itemOpened:true,status:true,
  decisionNote:true,reviewedAt:true,createdAt:true,updatedAt:true,
  order:{select:{orderNumber:true,createdAt:true}},
  orderItem:{select:{productNameAr:true,skuSnapshot:true,quantityItems:true}}
} as const;

async function serializable<T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
  return prisma.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

returnsCustomerRouter.get('/',async(_req,res,next)=>{
  try{
    const records=await prisma.returnRequest.findMany({
      where:{customerId:res.locals.customerId},
      select:responseSelect,orderBy:{createdAt:'desc'},take:100
    });
    res.setHeader('Cache-Control','no-store');
    res.json({requests:records});
  }catch(e){next(e);}
});

returnsCustomerRouter.post('/',rateLimit({
  windowMs:60*60*1000,limit:6,standardHeaders:'draft-7',legacyHeaders:false
}),async(req,res,next)=>{
  const parsed=requestSchema.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:'يرجى اختيار المنتج والكمية والسبب ووصف المشكلة بوضوح.'});return;}
  const customerId=res.locals.customerId as string;
  const d=parsed.data;
  try{
    const record=await serializable(async tx=>{
      const item=await tx.orderItem.findUnique({
        where:{id:d.orderItemId},
        select:{id:true,orderId:true,quantityItems:true,
          order:{select:{customerId:true,state:true,shipments:{select:{state:true,deliveredAt:true}}}}
        }
      });
      if(!item||item.order.customerId!==customerId)throw new Error('ORDER_NOT_FOUND');
      const delivered=item.order.state==='DELIVERED'||
        item.order.shipments.some(s=>s.state==='DELIVERED');
      if(!delivered)throw new Error('NOT_DELIVERED');
      const deliveredDate=item.order.shipments.filter(s=>s.state==='DELIVERED'&&s.deliveredAt)
        .map(s=>s.deliveredAt!).sort((a,b)=>b.getTime()-a.getTime())[0];
      // Seven-day ordinary change-of-mind rule; defects and wrong shipments always
      // remain eligible for manual review, independent of this time window.
      if(d.reason==='CHANGED_MIND'&&deliveredDate&&
        Date.now()-deliveredDate.getTime()>7*24*60*60*1000)
        throw new Error('RETURN_WINDOW');
      const used=await tx.returnRequest.aggregate({
        where:{orderItemId:item.id,status:{not:'REJECTED'}},
        _sum:{quantity:true}
      });
      if((used._sum.quantity||0)+d.quantity>item.quantityItems)
        throw new Error('QUANTITY_EXCEEDED');
      return tx.returnRequest.create({data:{
        customerId,orderId:item.orderId,orderItemId:item.id,kind:d.kind,
        reason:d.reason as ReturnReason,quantity:d.quantity,
        explanation:d.explanation,itemOpened:d.itemOpened,status:'SUBMITTED'
      },select:responseSelect});
    });
    res.status(201).json({request:record,message:'تم استلام طلب الاسترجاع للمراجعة. لا يعني ذلك صدور موافقة أو استرداد مبلغ.'});
  }catch(e){
    const msg=e instanceof Error?e.message:'';
    const errors:Record<string,string>={
      ORDER_NOT_FOUND:'هذا المنتج غير موجود ضمن طلبات حسابك.',
      NOT_DELIVERED:'يمكن تقديم طلب استرجاع بعد توثيق تسليم الشحنة. للإلغاء قبل التسليم تواصل مع المتجر.',
      RETURN_WINDOW:'انتهت مدة العدول الاعتيادي البالغة 7 أيام وفق تاريخ التسليم المسجل. اختر سبب العيب أو عدم المطابقة إن كان ينطبق على حالتك.',
      QUANTITY_EXCEEDED:'الكمية المطلوبة تتجاوز الكمية المتاحة للاسترجاع لهذا الصنف، مع احتساب الطلبات السابقة.'
    };
    if(errors[msg]){res.status(409).json({error:errors[msg]});return;}
    if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2034'){
      res.status(409).json({error:'استُلم طلب آخر لهذا المنتج؛ حدّث القائمة ثم حاول مجددًا.'});return;
    }
    next(e);
  }
});

returnsCustomerRouter.post('/:id/reply',async(req,res,next)=>{
  const parsed=customerReply.safeParse(req.body);
  if(!parsed.success||!idOk(req.params.id)){res.status(400).json({error:'اكتب ردًا يوضح المعلومات المطلوبة بحد أدنى 15 حرفًا.'});return;}
  try{
    const updated=await prisma.returnRequest.updateMany({
      where:{id:req.params.id,customerId:res.locals.customerId,status:'NEEDS_INFORMATION'},
      data:{explanation:parsed.data.explanation,status:'SUBMITTED',decisionNote:null,reviewedAt:null}
    });
    if(updated.count!==1){res.status(409).json({error:'لا يوجد طلب ينتظر معلومات إضافية بهذا الرقم.'});return;}
    res.json({message:'تم إرسال المعلومات للمتجر وإعادة الطلب للمراجعة.'});
  }catch(e){next(e);}
});

returnsAdminRouter.get('/',async(_req,res,next)=>{
  try{
    const requests=await prisma.returnRequest.findMany({
      select:{...responseSelect,
        customer:{select:{name:true,email:true,phone:true}}},
      orderBy:{createdAt:'desc'},take:200
    });
    res.setHeader('Cache-Control','no-store');
    res.json({requests});
  }catch(e){next(e);}
});

returnsAdminRouter.patch('/:id/review',async(req,res,next)=>{
  const parsed=decisionSchema.safeParse(req.body);
  if(!parsed.success||!idOk(req.params.id)){
    res.status(400).json({error:'اختر القرار وأضف شرحًا لا يقل عن 10 أحرف.'});return;
  }
  const {status,note}=parsed.data;
  try{
    const record=await serializable(async tx=>{
      const current=await tx.returnRequest.findUnique({
        where:{id:req.params.id},select:{id:true,status:true}
      });
      if(!current)throw new Error('NOT_FOUND');
      const allowed:Record<ReturnRequestStatus,ReturnRequestStatus[]>={
        SUBMITTED:['NEEDS_INFORMATION','APPROVED','REJECTED'],
        NEEDS_INFORMATION:['APPROVED','REJECTED'],
        APPROVED:['ITEM_RECEIVED'],
        REJECTED:[],
        ITEM_RECEIVED:[]
      };
      if(!allowed[current.status].includes(status))throw new Error('INVALID_TRANSITION');
      const result=await tx.returnRequest.updateMany({
        where:{id:current.id,status:current.status},
        data:{status,decisionNote:note,reviewedAt:new Date(),reviewedBy:res.locals.adminId}
      });
      if(result.count!==1)throw new Error('INVALID_TRANSITION');
      await tx.auditLog.create({data:{
        actorId:res.locals.adminId,entityType:'ReturnRequest',entityId:current.id,
        event:'RETURN_REQUEST_REVIEWED',
        metadata:{previousStatus:current.status,newStatus:status,note}
      }});
      return current.id;
    });
    res.json({id:record,message:status==='ITEM_RECEIVED'
      ?'تم توثيق استلام المرتجع. لا يُعاد للمخزون ولا يُرد أي مبلغ تلقائيًا.'
      :'تم حفظ القرار وإتاحته للعميل في حسابه.'});
  }catch(e){
    if(e instanceof Error&&e.message==='NOT_FOUND'){res.status(404).json({error:'الطلب غير موجود.'});return;}
    if(e instanceof Error&&e.message==='INVALID_TRANSITION'){
      res.status(409).json({error:'لا يمكن إجراء هذا الانتقال من حالة الطلب الحالية. حدّث القائمة.'});return;
    }
    next(e);
  }
});
