import { useEffect, useState, type FormEvent } from 'react';
import { Banknote, Building2, CheckCircle2, CircleAlert, ClipboardCheck, CreditCard, Plus, Save, ShieldCheck, Trash2, Truck } from 'lucide-react';
import {
  getMerchantBilling,getMerchantPayments,getMerchantShipping,
  saveMerchantBilling,saveMerchantPayments,saveMerchantShipping,
  type MerchantBillingSettings,type MerchantShippingSettings,type MerchantPaymentSettings
} from '../api';

type Tab='billing'|'shipping'|'payments';
const billingDefault:MerchantBillingSettings={
  legalNameAr:'',tradeNameAr:'',commercialRegistration:'',taxStatus:'UNCONFIRMED',
  vatNumber:'',zatcaPhase:'UNDETERMINED',nationalAddress:'',
  customerServiceEmail:'',customerServicePhone:'',documentNotes:'',reviewedByMerchant:false
};
const shippingDefault:MerchantShippingSettings={
  policyPublished:false,rateEntries:[],shippingPolicy:'',specialNotice:''
};
const paymentsDefault:MerchantPaymentSettings={
  preferredProvider:'UNDECIDED',preferredMethods:[],agreementReviewed:false,readinessNotes:''
};
const paymentNames:Record<MerchantPaymentSettings['preferredMethods'][number],string>={
  MADA:'مدى',VISA_MASTERCARD:'فيزا / ماستركارد',APPLE_PAY:'Apple Pay',
  BANK_TRANSFER:'تحويل بنكي',CASH_ON_DELIVERY:'الدفع عند الاستلام'
};

export function AdminMerchantSettings({token}:{token:string}){
  const [tab,setTab]=useState<Tab>('billing');
  const [billing,setBilling]=useState<MerchantBillingSettings>(billingDefault);
  const [shipping,setShipping]=useState<MerchantShippingSettings>(shippingDefault);
  const [payments,setPayments]=useState<MerchantPaymentSettings>(paymentsDefault);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    let live=true;
    Promise.all([getMerchantBilling(token),getMerchantShipping(token),getMerchantPayments(token)])
      .then(([b,s,p])=>{if(!live)return;
        setBilling(b.settings);setShipping(s.settings);setPayments(p.settings);
      }).catch(e=>{if(live)setError(e instanceof Error?e.message:'تعذر قراءة إعدادات المنشأة.');})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[token]);
  const changeBilling=<K extends keyof MerchantBillingSettings>(key:K,value:MerchantBillingSettings[K])=>
    setBilling(prev=>({...prev,[key]:value,reviewedByMerchant:key==='reviewedByMerchant'?Boolean(value):false,
      ...(key==='taxStatus'&&value!=='REGISTERED'?{vatNumber:''}:{})}));
  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(saving||loading)return;
    setSaving(true);setError('');setNotice('');
    try{
      const result=tab==='billing'?await saveMerchantBilling(token,billing):
        tab==='shipping'?await saveMerchantShipping(token,shipping):
        await saveMerchantPayments(token,payments);
      setNotice(result.message);
    }catch(err){setError(err instanceof Error?err.message:'تعذر حفظ الإعدادات.');}
    finally{setSaving(false);}
  }
  const tabButtons:{id:Tab;label:string;icon:typeof Building2}[]=[
    {id:'billing',label:'المنشأة والفوترة',icon:Building2},
    {id:'shipping',label:'التوصيل وأسعاره',icon:Truck},
    {id:'payments',label:'خيارات الدفع',icon:CreditCard}
  ];
  return <section className="admin-panel fahdan-merchant-settings" id="fahdan-merchant-settings">
    <div className="panel-heading"><h2><ClipboardCheck size={21}/> تهيئة الفوترة والشحن والدفع</h2>
      <span>إدارة المتجر فقط</span></div>
    <p className="fahdan-merchant-intro">أدخل البيانات الرسمية الصحيحة للمنشأة، ثم حدد أسعار توصيل المدن وخيارات الدفع المرغوبة. حفظ الإعدادات <b>لا يشغّل بوابة الدفع ولا يُصدر فاتورة زاتكا</b>.</p>
    <div className="fahdan-merchant-tabs" role="tablist" aria-label="إعدادات المتجر">
      {tabButtons.map(t=><button key={t.id} type="button" role="tab"
        aria-selected={tab===t.id} className={tab===t.id?'selected':''}
        onClick={()=>{setTab(t.id);setError('');setNotice('');}} disabled={saving}>
        <t.icon size={18}/>{t.label}</button>)}
    </div>
    {loading?<p>جارٍ قراءة إعدادات المتجر…</p>:<>
      {error&&<div className="fahdan-merchant-message warning" role="alert"><CircleAlert size={18}/>{error}</div>}
      {notice&&<div className="fahdan-merchant-message success" role="status"><CheckCircle2 size={18}/>{notice}</div>}
      <form className="fahdan-merchant-form" onSubmit={save}>
        {tab==='billing'&&<>
          <div className="fahdan-merchant-heading"><Building2 size={22}/><div><h3>الهوية القانونية والفوترة</h3><p>البيانات تُحفظ للمدير فقط، ويجب مطابقتها مع مستندات المنشأة الرسمية قبل اعتمادها.</p></div></div>
          <div className="fahdan-merchant-grid">
            <label>الاسم القانوني للمنشأة
              <input maxLength={160} value={billing.legalNameAr} onChange={e=>changeBilling('legalNameAr',e.target.value)}/></label>
            <label>الاسم التجاري
              <input maxLength={160} value={billing.tradeNameAr} placeholder="فهدان للعود"
                onChange={e=>changeBilling('tradeNameAr',e.target.value)}/></label>
            <label>رقم السجل التجاري (إن وجد)
              <input dir="ltr" inputMode="numeric" maxLength={10} pattern="[0-9]{10}"
                value={billing.commercialRegistration} onChange={e=>changeBilling('commercialRegistration',e.target.value)}/></label>
            <label>حالة التسجيل بضريبة القيمة المضافة
              <select value={billing.taxStatus} onChange={e=>changeBilling('taxStatus',e.target.value as MerchantBillingSettings['taxStatus'])}>
                <option value="UNCONFIRMED">لم تُحسم بعد</option>
                <option value="REGISTERED">المنشأة مسجلة في ضريبة القيمة المضافة</option>
                <option value="NOT_REGISTERED">غير مسجلة في ضريبة القيمة المضافة</option>
              </select></label>
            {billing.taxStatus==='REGISTERED'&&<label>رقم التسجيل في ضريبة القيمة المضافة (15 رقمًا)
              <input required dir="ltr" inputMode="numeric" minLength={15} maxLength={15} pattern="[0-9]{15}"
                value={billing.vatNumber} onChange={e=>changeBilling('vatNumber',e.target.value)}/></label>}
            <label>مرحلة الالتزام بالفوترة الإلكترونية
              <select value={billing.zatcaPhase} onChange={e=>changeBilling('zatcaPhase',e.target.value as MerchantBillingSettings['zatcaPhase'])}>
                <option value="UNDETERMINED">تتطلب التحقق من زاتكا / المحاسب</option>
                <option value="PHASE1">مرحلة الإصدار والحفظ</option>
                <option value="PHASE2">مرحلة الربط والتكامل</option>
              </select></label>
            <label className="wide">العنوان الوطني القانوني
              <textarea maxLength={350} rows={2} value={billing.nationalAddress}
                onChange={e=>changeBilling('nationalAddress',e.target.value)}/></label>
            <label>بريد التواصل مع العملاء
              <input type="email" maxLength={160} value={billing.customerServiceEmail}
                onChange={e=>changeBilling('customerServiceEmail',e.target.value)}/></label>
            <label>هاتف خدمة العملاء
              <input maxLength={30} value={billing.customerServicePhone}
                onChange={e=>changeBilling('customerServicePhone',e.target.value)}/></label>
            <label className="wide">ملاحظات جاهزية الفوترة
              <textarea rows={2} maxLength={600} value={billing.documentNotes}
                onChange={e=>changeBilling('documentNotes',e.target.value)}/></label>
          </div>
          <label className="fahdan-merchant-check"><input type="checkbox" checked={billing.reviewedByMerchant}
            onChange={e=>changeBilling('reviewedByMerchant',e.target.checked)}/>
            تحققت من صحة البيانات أعلاه بموجب المستندات الرسمية للمنشأة.</label>
          <p className="fahdan-merchant-guidance"><ShieldCheck size={18}/> حتى بعد التأكيد تظل الفاتورة الإلكترونية الضريبية وQR وإرسال XML إلى زاتكا معطلة حتى دمج حل متوافق وتأكيد المتطلبات.</p>
        </>}
        {tab==='shipping'&&<>
          <div className="fahdan-merchant-heading"><Truck size={22}/><div><h3>تعرفات المدن وسياسة التوصيل</h3><p>لا نضع رسومًا افتراضية أو شحنًا مجانيًا من تلقاء أنفسنا. أدخل أسعارًا فعلية وافحص شروط التوصيل قبل نشرها.</p></div></div>
          <div className="fahdan-merchant-rate-rows">
            {shipping.rateEntries.map((rate,i)=><div className="fahdan-merchant-rate" key={i}>
              <label>المدينة<input required minLength={2} maxLength={80} value={rate.city} placeholder="اسم المدينة"
                onChange={e=>setShipping(prev=>({...prev,rateEntries:prev.rateEntries.map((v,j)=>j===i?{...v,city:e.target.value}:v)}))}/></label>
              <label>رسوم التوصيل (ريال)<input required type="number" min="0" step="0.01" value={rate.feeSar}
                onChange={e=>setShipping(prev=>({...prev,rateEntries:prev.rateEntries.map((v,j)=>j===i?{...v,feeSar:e.target.value}:v)}))}/></label>
              <label>المدة المتوقعة (اختياري)<input maxLength={130} placeholder="تُحدّد وفق شركة الشحن" value={rate.etaText}
                onChange={e=>setShipping(prev=>({...prev,rateEntries:prev.rateEntries.map((v,j)=>j===i?{...v,etaText:e.target.value}:v)}))}/></label>
              <button type="button" title="حذف المدينة" disabled={saving} onClick={()=>
                setShipping(prev=>({...prev,rateEntries:prev.rateEntries.filter((_,j)=>j!==i)}))}>
                <Trash2 size={16}/></button>
            </div>)}
          </div>
          <button type="button" className="fahdan-merchant-add" disabled={saving||shipping.rateEntries.length>=50}
            onClick={()=>setShipping(prev=>({...prev,rateEntries:[...prev.rateEntries,{city:'',feeSar:'',etaText:''}]}))}>
            <Plus size={16}/> إضافة مدينة ورسوم توصيل</button>
          <div className="fahdan-merchant-grid">
            <label className="wide">سياسة الشحن والتوصيل (30 حرفًا على الأقل للنشر)
              <textarea rows={5} maxLength={2500} value={shipping.shippingPolicy}
                placeholder="اشرح نطاق التوصيل وأوقات العمل وطريقة التنسيق مع العميل ومتى تُحدّد التكلفة النهائية…"
                onChange={e=>setShipping(prev=>({...prev,shippingPolicy:e.target.value}))}/></label>
            <label className="wide">تنبيه أو استثناءات (اختياري)
              <textarea rows={2} maxLength={500} value={shipping.specialNotice}
                onChange={e=>setShipping(prev=>({...prev,specialNotice:e.target.value}))}/></label>
          </div>
          <label className="fahdan-merchant-check"><input type="checkbox" checked={shipping.policyPublished}
            onChange={e=>setShipping(prev=>({...prev,policyPublished:e.target.checked}))}/>
            أعتمد نشر رسوم التوصيل وشروطها للعملاء (بصفتها رسومًا تقديرية قبل تأكيد الطلب).</label>
          <p className="fahdan-merchant-guidance"><CircleAlert size={17}/> لا تُضاف الرسوم إلى أي طلب قائم أو فاتورة بشكل آلي. العميل يرى تقدير المدينة فقط، ولا يُحصّل منه مبلغ حتى تفعيل مسار إتمام الشراء.</p>
        </>}
        {tab==='payments'&&<>
          <div className="fahdan-merchant-heading"><CreditCard size={22}/><div><h3>خيارات الدفع المقترحة</h3><p>هذه مرحلة اختيار مزود الدفع ومتطلبات التعاقد فقط. لا تُدخل كلمات مرور أو مفاتيح API أو بيانات بطاقات هنا.</p></div></div>
          <div className="fahdan-merchant-grid">
            <label>مزود بوابة الدفع المقترح
              <select value={payments.preferredProvider}
                onChange={e=>setPayments(prev=>({...prev,preferredProvider:e.target.value as MerchantPaymentSettings['preferredProvider'],agreementReviewed:false}))}>
                <option value="UNDECIDED">لم يُحدد بعد</option>
                <option value="MOYASAR">ميسر Moyasar</option>
                <option value="TAP">تاب Tap</option>
                <option value="HYPERPAY">هايبر باي HyperPay</option>
                <option value="OTHER">مزود آخر</option>
              </select></label>
            <div className="fahdan-merchant-methods">
              <strong>طرق الدفع المرغوبة عند التفعيل</strong>
              {(Object.entries(paymentNames) as [MerchantPaymentSettings['preferredMethods'][number],string][]).map(([value,label])=>
                <label key={value}><input type="checkbox" checked={payments.preferredMethods.includes(value)}
                  onChange={e=>setPayments(prev=>({...prev,
                    agreementReviewed:false,preferredMethods:e.target.checked?
                      [...prev.preferredMethods,value]:prev.preferredMethods.filter(x=>x!==value)
                  }))}/>{label}</label>)}
            </div>
            <label className="wide">ملاحظات التعاقد والربط
              <textarea rows={4} maxLength={1400} value={payments.readinessNotes}
                onChange={e=>setPayments(prev=>({...prev,readinessNotes:e.target.value,agreementReviewed:false}))}/></label>
          </div>
          <label className="fahdan-merchant-check"><input type="checkbox"
            checked={payments.agreementReviewed} onChange={e=>setPayments(prev=>({...prev,agreementReviewed:e.target.checked}))}/>
            راجعت خيارات الدفع مع مزود الخدمة؛ لا تعني هذه الموافقة أن الدفع الإلكتروني مفعّل.</label>
          <p className="fahdan-merchant-guidance"><Banknote size={18}/> التحصيل الآلي ورد المبالغ عبر بوابة الدفع وحجز المخزون لم تُفعّل بعد. لا تظهر الطرق المختارة للعملاء كخيارات قابلة للدفع.</p>
        </>}
        <div className="fahdan-merchant-footer">
          <button type="submit" className="button dark" disabled={saving}>
            <Save size={17}/>{saving?'جارٍ الحفظ…':'حفظ إعدادات '+(tab==='billing'?'المنشأة':tab==='shipping'?'التوصيل':'الدفع')}</button>
          <small>يُوثَّق تعديل الإعدادات باسم حساب المدير.</small>
        </div>
      </form>
    </>}
  </section>;
}
