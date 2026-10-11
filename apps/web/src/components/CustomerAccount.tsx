import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, UserRound, ShieldCheck } from 'lucide-react';
import { customerForgot, customerLogin, customerRegister, customerReset, customerStatus, customerVerify, type Customer } from '../api';

type View = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify';
const labels:Record<View,{title:string;description:string}> = {
  login:{title:'تسجيل الدخول',description:'أهلًا بك من جديد في فهدان للعود.'},
  register:{title:'إنشاء حساب جديد',description:'انضم إلى فهدان واستمتع بتجربة تسوق مميزة.'},
  'forgot-password':{title:'نسيت كلمة المرور؟',description:'سنرسل لك رابطًا آمنًا لإنشاء كلمة مرور جديدة.'},
  'reset-password':{title:'كلمة مرور جديدة',description:'أدخل كلمة مرور قوية لتحديث حسابك.'},
  verify:{title:'تأكيد البريد الإلكتروني',description:'اضغط لتفعيل حسابك عبر رابط التحقق الذي وصلك.'}
};
export function CustomerAccount({view,customer,onSignIn,onSignOut}:{view:View;customer:Customer|null;onSignIn:(customer:Customer,token:string)=>void;onSignOut:()=>void}) {
  const navigate=useNavigate();
  const [params]=useSearchParams();
  const token=params.get('token')||'';
  const [email,setEmail]=useState('');
  const [name,setName]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [mailReady,setMailReady]=useState<boolean|null>(null);

  useEffect(()=>{
    let live=true;
    customerStatus().then(v=>{if(live)setMailReady(v.emailAvailable);}).catch(()=>{if(live)setMailReady(false)});
    return()=>{live=false};
  },[]);
  useEffect(()=>{setError('');setNotice('');setPassword('');setConfirm('');},[view,token]);

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError('');setNotice('');
    try {
      if(view==='register'){
        if(password!==confirm)throw new Error('كلمتا المرور غير متطابقتين.');
        const response=await customerRegister({name,email,password});
        setNotice(response.message+' افحص البريد الوارد والبريد غير المرغوب فيه.');
      } else if(view==='login'){
        const response=await customerLogin({email,password});
        onSignIn(response.user,response.token);navigate('/account',{replace:true});
      } else if(view==='forgot-password'){
        const response=await customerForgot(email);
        setNotice(response.message+' افحص البريد الوارد والبريد غير المرغوب فيه.');
      } else if(view==='reset-password'){
        if(!token)throw new Error('رابط الاستعادة غير مكتمل.');
        if(password!==confirm)throw new Error('كلمتا المرور غير متطابقتين.');
        const response=await customerReset(token,password);
        setNotice(response.message);setPassword('');setConfirm('');
      } else if(view==='verify'){
        if(!token)throw new Error('رابط التأكيد غير مكتمل.');
        const response=await customerVerify(token);
        setNotice(response.message);
      }
    }catch(e){setError(e instanceof Error?e.message:'تعذر إكمال الطلب. حاول مرة أخرى.');}
    finally{setBusy(false);}
  }

  const logout=()=>{onSignOut();setNotice('تم تسجيل الخروج.');};
  const needsMail=view==='register'||view==='forgot-password';
  const done=Boolean(notice);
  return <main className="container customer-auth-wrap">
    <div className="auth-decoration"><span>FAHDAN OUD</span><h2>كل طيبٍ له حكاية</h2><p>حسابك في فهدان يمنحك مساحة شخصية للعودة إلى عطورك وأعوادك المفضلة.</p><div className="auth-seal"><ShieldCheck size={34}/> خصوصيتك أولويتنا</div></div>
    <div className="customer-auth-card">
      <div className="auth-icon">{view==='register'?<UserRound/>:view==='forgot-password'||view==='reset-password'?<KeyRound/>:view==='verify'?<Mail/>:<LockKeyhole/>}</div>
      <span className="section-kicker">فهدان للعود • حساب العملاء</span>
      <h1>{customer&&view==='login'?'أهلًا، '+customer.name:labels[view].title}</h1>
      <p className="auth-description">{customer&&view==='login'?'حسابك جاهز لتصفح متجر فهدان.':labels[view].description}</p>
      {customer&&view==='login'?<div className="customer-auth-profile">
        <p><strong>الاسم:</strong> {customer.name}</p><p><strong>البريد:</strong> {customer.email}</p>
        <p className="auth-message success"><CheckCircle2 size={19}/> بريدك الإلكتروني مؤكد.</p>
        <div className="auth-actions"><Link className="button dark" to="/account">فتح حسابي <ArrowLeft size={17}/></Link>
          <button className="button light" onClick={logout}>تسجيل الخروج</button></div>
      </div>:<>
        {needsMail&&mailReady===false&&<div className="auth-message warning" role="alert">خدمة إرسال الرسائل لم تُفعّل بعد. التسجيل واستعادة كلمة المرور غير متاحين مؤقتًا.</div>}
        {error&&<p className="auth-message warning" role="alert">{error}</p>}
        {notice&&<p className="auth-message success" role="status"><CheckCircle2 size={18}/>{notice}</p>}
        {!done&&<form className="customer-auth-form" onSubmit={submit}>
          {view==='register'&&<label>الاسم الكامل
            <input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="الاسم الكامل" />
          </label>}
          {(['login','register','forgot-password'] as View[]).includes(view)&&<label>البريد الإلكتروني
            <input type="email" autoComplete="email" dir="ltr" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" />
          </label>}
          {(['login','register','reset-password'] as View[]).includes(view)&&<label>{view==='login'?'كلمة المرور':'كلمة المرور الجديدة'}
            <div className="password-entry">
              <input type={showPassword?'text':'password'} autoComplete={view==='login'?'current-password':'new-password'}
                minLength={view==='login'?1:8} required value={password} onChange={e=>setPassword(e.target.value)}
                placeholder={view==='login'?'كلمة المرور':'8 أحرف على الأقل'} />
              <button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'إخفاء كلمة المرور':'إظهار كلمة المرور'}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button>
            </div>
          </label>}
          {(view==='register'||view==='reset-password')&&<label>تأكيد كلمة المرور
            <input type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} required
              value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="أعد إدخال كلمة المرور" />
          </label>}
          {(view==='register'||view==='reset-password')&&<small className="auth-hint">الحد الأدنى 8 أحرف، ولحماية حسابك نوصي بكلمة مرور أطول يصعب تخمينها.</small>}
          <button type="submit" className="button dark block" disabled={busy||(needsMail&&mailReady!==true)}>
            {busy?'جارٍ المعالجة…':view==='login'?'دخول الحساب':view==='register'?'إنشاء حساب وإرسال رابط التفعيل':view==='forgot-password'?'إرسال رابط الاستعادة':view==='reset-password'?'حفظ كلمة المرور الجديدة':'تأكيد البريد الإلكتروني'}
            <ArrowLeft size={17}/>
          </button>
        </form>}
        <div className="auth-navigation">
          {view==='login'?<><Link to="/account/forgot-password">نسيت كلمة المرور؟</Link><span>ليس لديك حساب؟ <Link to="/account/register">إنشاء حساب جديد</Link></span></>:
           <span>لديك حساب؟ <Link to="/account/login">تسجيل الدخول</Link></span>}
        </div>
      </>}
      <div className="auth-footnote"><ShieldCheck size={16}/> روابط التفعيل والاستعادة مؤقتة وتُستخدم مرة واحدة.</div>
    </div>
  </main>;
}
