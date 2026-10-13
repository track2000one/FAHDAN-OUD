import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, MapPin, Truck } from 'lucide-react';
import { getPublicShippingPolicy, type ShippingPolicyPublic } from '../api';

const money=(v:string)=>new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR'}).format(Number(v));
export function ShippingPolicy(){
  const [data,setData]=useState<ShippingPolicyPublic|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;getPublicShippingPolicy()
      .then(x=>{if(active)setData(x);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'تعذر قراءة سياسة الشحن.');});
    return()=>{active=false;};
  },[]);
  return <main className="container fahdan-shipping-policy" dir="rtl">
    <div className="fahdan-shipping-policy-head">
      <span className="section-kicker">فهدان للعود • خدمات التوصيل</span>
      <h1><Truck size={29}/> سياسة الشحن والتوصيل</h1>
      <p>تُعرض رسوم التوصيل عند اعتمادها من إدارة المتجر، ويظل كل طلب شراء مبدئيًا حتى التأكد من العنوان والتكلفة النهائية.</p>
    </div>
    {error&&<p role="alert"><CircleAlert size={17}/>{error}</p>}
    {!data&&!error&&<p>جارٍ تحميل سياسة التوصيل…</p>}
    {data&&<section className="fahdan-shipping-policy-card">
      <h2><MapPin size={20}/> المدن ورسوم التوصيل</h2>
      <p>{data.notice}</p>
      {data.configured?<><div className="fahdan-shipping-tariffs">
        {data.rates.map(r=><div key={r.city}>
          <strong>{r.city}</strong><span>{money(r.feeSar)}</span>
          {r.etaText&&<small>{r.etaText}</small>}
        </div>)}
      </div><h2>شروط وأحكام التوصيل</h2>
        <p className="fahdan-policy-pre">{data.policy}</p>
        {data.specialNotice&&<p className="fahdan-shipping-special">{data.specialNotice}</p>}
      </>:<p>لم تُنشر أسعار التوصيل بعد. يُبلغ المتجر العميل بالتكلفة قبل تأكيد أي شراء أو طلب تحصيل.</p>}
      <p className="fahdan-shipping-disclaimer">لا تُعد هذه الصفحة بوليصة شحن، ولا تؤكد توفر خدمة التوصيل خارج المدن المدرجة. الأسعار الاسترشادية لا تعني بدء معالجة الدفع.</p>
    </section>}
    <div className="fahdan-policy-links"><Link className="button dark" to="/">العودة إلى المتجر</Link>
      <Link to="/returns-policy">سياسة الاستبدال والاسترجاع</Link></div>
  </main>;
}
