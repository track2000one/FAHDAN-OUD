import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { emailEnabled, sendCustomerMail, type MailPurpose } from '../lib/transactional-email.js';

export const customerRouter = Router();
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8).max(72).refine(v => Buffer.byteLength(v,'utf8') <= 72,
  'كلمة المرور طويلة جدًا.');
const registration = z.object({name:z.string().trim().min(2).max(80),email,password});
const emailOnly = z.object({email});
const tokenOnly = z.object({token:z.string().regex(/^[a-f0-9]{64}$/i)});
const reset = tokenOnly.extend({password});
const login = z.object({email,password:z.string().min(1).max(200)});
const generic = {message:'إذا كانت البيانات صحيحة، ستصلك رسالة على البريد الإلكتروني.'};
const digest = (token:string) => createHash('sha256').update(token).digest('hex');

async function issue(user:{id:string;email:string;name:string},kind:MailPurpose) {
  const recent = await prisma.emailActionToken.findFirst({
    where:{userId:user.id,kind,usedAt:null,createdAt:{gt:new Date(Date.now()-2*60*1000)}},
    orderBy:{createdAt:'desc'}
  });
  if (recent) return;
  const raw = randomBytes(32).toString('hex');
  const created = await prisma.emailActionToken.create({data:{
    userId:user.id,kind,tokenHash:digest(raw),
    expiresAt:new Date(Date.now()+(kind==='VERIFY_EMAIL'?24*60:30)*60*1000)
  }});
  try {
    await sendCustomerMail(user.email,user.name,kind,raw);
  } catch(err) {
    await prisma.emailActionToken.updateMany({where:{id:created.id,usedAt:null},data:{usedAt:new Date()}});
    throw err;
  }
}

// Public readiness check has no secrets. UI disables registration when email delivery isn't configured.
customerRouter.get('/status',(_req,res)=>res.json({emailAvailable:emailEnabled()}));

customerRouter.post('/register',async(req,res,next)=>{
  try {
    if(!emailEnabled()){res.status(503).json({error:'تسجيل الحسابات غير متاح مؤقتًا حتى تفعيل البريد الإلكتروني للمتجر.'});return;}
    const parsed=registration.safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:'تحقق من الاسم والبريد الإلكتروني وكلمة مرور لا تقل عن 8 أحرف.'});return;}
    const {name,email:address,password:pass}=parsed.data;
    let existing=await prisma.user.findUnique({where:{email:address}});
    if(!existing){
      try {
        existing=await prisma.user.create({data:{
          name,email:address,passwordHash:await bcrypt.hash(pass,12),role:'CUSTOMER',enabled:true
        }});
      } catch(e) {
        // A concurrent request may have created the account.
        const found=await prisma.user.findUnique({where:{email:address}});
        if(!found)throw e;
        existing=found;
      }
    }
    // No registration request may overwrite an existing customer's password or grant a privileged role.
    if(existing.role==='CUSTOMER' && existing.enabled && !existing.emailVerifiedAt &&
       existing.passwordHash && await bcrypt.compare(pass,existing.passwordHash)){
      try {await issue(existing,'VERIFY_EMAIL');}
      catch {res.status(503).json({error:'تعذر إرسال رسالة التفعيل حاليًا، يرجى المحاولة لاحقًا.'});return;}
    }
    res.status(202).json(generic);
  }catch(e){next(e);}
});

customerRouter.post('/verify-email',async(req,res,next)=>{
  try {
    const data=tokenOnly.safeParse(req.body);
    if(!data.success){res.status(400).json({error:'رابط التفعيل غير صالح.'});return;}
    const record=await prisma.emailActionToken.findUnique({where:{tokenHash:digest(data.data.token)},include:{user:true}});
    if(!record||record.kind!=='VERIFY_EMAIL'||record.usedAt||record.expiresAt<=new Date()||
       record.user.role!=='CUSTOMER'||!record.user.enabled){
      res.status(400).json({error:'رابط التفعيل غير صالح أو منتهي الصلاحية.'});return;
    }
    const updated=await prisma.$transaction(async(tx)=>{
      const consumed=await tx.emailActionToken.updateMany({
        where:{id:record.id,usedAt:null,expiresAt:{gt:new Date()}},data:{usedAt:new Date()}
      });
      if(!consumed.count)return false;
      await tx.user.update({where:{id:record.userId},data:{emailVerifiedAt:new Date()}});
      return true;
    });
    res.status(updated?200:400).json(updated?{message:'تم تأكيد بريدك الإلكتروني. يمكنك تسجيل الدخول الآن.'}:
      {error:'رابط التفعيل مستخدم بالفعل.'});
  }catch(e){next(e);}
});

customerRouter.post('/login',async(req,res,next)=>{
  try {
    const data=login.safeParse(req.body);
    if(!data.success){res.status(400).json({error:'تحقق من البريد الإلكتروني وكلمة المرور.'});return;}
    const user=await prisma.user.findUnique({where:{email:data.data.email}});
    const valid=user?.passwordHash ? await bcrypt.compare(data.data.password,user.passwordHash) : false;
    if(!valid||user?.role!=='CUSTOMER'||!user.enabled){
      res.status(401).json({error:'البريد الإلكتروني أو كلمة المرور غير صحيحة.'});return;
    }
    if(!user.emailVerifiedAt){res.status(403).json({error:'يجب تأكيد بريدك الإلكتروني أولًا. راجع رسالة التفعيل.'});return;}
    const token=jwt.sign({purpose:'customer'},process.env.JWT_SECRET!,{
      subject:user.id,audience:'fahdan-customers',expiresIn:'24h'
    });
    res.json({token,user:{id:user.id,name:user.name,email:user.email}});
  }catch(e){next(e);}
});

customerRouter.post('/forgot-password',async(req,res,next)=>{
  try {
    if(!emailEnabled()){res.status(503).json({error:'استعادة كلمة المرور غير متاحة مؤقتًا حتى تفعيل بريد المتجر.'});return;}
    const data=emailOnly.safeParse(req.body);
    if(!data.success){res.status(400).json({error:'أدخل بريدًا إلكترونيًا صحيحًا.'});return;}
    const user=await prisma.user.findUnique({where:{email:data.data.email}});
    if(user?.enabled && user.role==='CUSTOMER') {
      try {await issue(user,'RESET_PASSWORD');}
      catch {console.error('Could not send password reset email.');}
    }
    res.status(202).json(generic);
  }catch(e){next(e);}
});

customerRouter.post('/reset-password',async(req,res,next)=>{
  try {
    const data=reset.safeParse(req.body);
    if(!data.success){res.status(400).json({error:'تحقق من رابط الاستعادة وكلمة المرور الجديدة (8 أحرف على الأقل).'});return;}
    const row=await prisma.emailActionToken.findUnique({
      where:{tokenHash:digest(data.data.token)},include:{user:true}
    });
    if(!row||row.kind!=='RESET_PASSWORD'||row.usedAt||row.expiresAt<=new Date()||
       !row.user.enabled||row.user.role!=='CUSTOMER'){
      res.status(400).json({error:'رابط الاستعادة غير صالح أو منتهي الصلاحية.'});return;
    }
    const hash=await bcrypt.hash(data.data.password,12);
    const changed=await prisma.$transaction(async(tx)=>{
      const consumed=await tx.emailActionToken.updateMany({
        where:{id:row.id,usedAt:null,expiresAt:{gt:new Date()}},data:{usedAt:new Date()}
      });
      if(!consumed.count)return false;
      await tx.user.update({where:{id:row.userId},data:{passwordHash:hash}});
      await tx.emailActionToken.updateMany({where:{userId:row.userId,kind:'RESET_PASSWORD',usedAt:null},
        data:{usedAt:new Date()}});
      return true;
    });
    res.status(changed?200:400).json(changed?{message:'تم تحديث كلمة المرور. يمكنك تسجيل الدخول.'}:
      {error:'هذا الرابط مستخدم بالفعل.'});
  }catch(e){next(e);}
});

customerRouter.get('/me',async(req,res)=>{
  try {
    const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if(!bearer){res.status(401).json({error:'يرجى تسجيل الدخول.'});return;}
    const decoded=jwt.verify(bearer,process.env.JWT_SECRET!,{audience:'fahdan-customers'}) as JwtPayload;
    if(typeof decoded.sub!=='string'||decoded.purpose!=='customer')throw new Error('Invalid audience');
    const user=await prisma.user.findUnique({where:{id:decoded.sub},
      select:{id:true,name:true,email:true,role:true,enabled:true,emailVerifiedAt:true}});
    if(!user||user.role!=='CUSTOMER'||!user.enabled||!user.emailVerifiedAt)
      throw new Error('Unauthorized');
    res.json({user:{id:user.id,name:user.name,email:user.email}});
  }catch{res.status(401).json({error:'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.'});}
});
