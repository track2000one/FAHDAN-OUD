import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CircleAlert, ClipboardCheck, MapPin, Package, ShieldCheck, Truck } from 'lucide-react';
import {
  getCheckoutQuote, getCustomerAddresses, submitPreliminaryOrder, getShippingEstimate,
  type ShippingEstimate,
  type CheckoutQuote, type CheckoutCartItem, type CustomerAddress
} from '../api';
import type { CartLine, Product } from '../types';

const formatPrice=(v:string|number)=>new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR'}).format(Number(v));
const SESSION_KEY='fahdan-customer-session';

export function CustomerCheckout({cart,products,onCompleted}:{
  cart:CartLine[];products:Product[];onCompleted:()=>void
}){
  const [addresses,setAddresses]=useState<CustomerAddress[]>([]);
  const [addressId,setAddressId]=useState('');
  const [quote,setQuote]=useState<CheckoutQuote|null>(null);
  const [shippingEstimate,setShippingEstimate]=useState<ShippingEstimate|null>(null);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState('');
  const [accepted,setAccepted]=useState(false);
  const [orderNumber,setOrderNumber]=useState('');
  const requestKey=useRef(crypto.randomUUID());
  const session=sessionStorage.getItem(SESSION_KEY);

  const signature=JSON.stringify(cart.map(item=>({sku:item.sku,quantity:item.quantity})));
  useEffect(()=>{requestKey.current=crypto.randomUUID();},[signature]);
  const items=useMemo(()=>{
    const result:CheckoutCartItem[]=[];
    for(const line of cart){
      const p=products.find(p=>p.id===line.productId);
      const variant=p?.variants.find(v=>v.sku===line.sku);
      if(!variant||line.demo)return null;
      result.push({variantId:variant.id,quantity:line.quantity});
    }
    return result;
    // signature ensures new items recompute when quantity or SKU changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature,products]);

  useEffect(()=>{
    if(!session){setLoading(false);return;}
    let live=true;
    getCustomerAddresses(session)
      .then(data=>{
        if(!live)return;
        setAddresses(data.addresses);
        setAddressId(prev=>data.addresses.some(a=>a.id===prev)?prev:
          data.addresses.find(a=>a.isDefault)?.id||data.addresses[0]?.id||'');
      })
      .catch(e=>{if(live)setError(e instanceof Error?e.message:'تعذر تحميل عناوين التوصيل.');})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false};
  },[session]);

  useEffect(()=>{
    if(!session||!items?.length){setQuote(null);return;}
    let live=true;setQuote(null);setError('');
    getCheckoutQuote(session,items)
      .then(value=>{if(live)setQuote(value);})
      .catch(e=>{if(live)setError(e instanceof Error?e.message:'تعذر حساب الأسعار من الخادم.');});
    return()=>{live=false};
  },[session,items]);

  const selected=addresses.find(a=>a.id===addressId);
  useEffect(()=>{
    if(!selected?.city){setShippingEstimate(null);return;}
    let live=true;setShippingEstimate(null);
    getShippingEstimate(selected.city).then(result=>{if(live)setShippingEstimate(result);})
      .catch(()=>{if(live)setShippingEstimate(null);});
    return()=>{live=false;};
  },[selected?.city]);

  const locationReady=selected?.latitude!==null&&selected?.latitude!==undefined&&
    selected?.longitude!==null&&selected?.longitude!==undefined;
  const locationLink=locationReady?
    'https://www.google.com/maps/search/?api=1&query='+
    encodeURIComponent(selected!.latitude+','+selected!.longitude):null;

  async function sendRequest(){
    if(!session||!items?.length||!addressId||!locationReady||!accepted||!quote)return;
    setSubmitting(true);setError('');
    try{
      const response=await submitPreliminaryOrder(session,{
        items,addressId,requestKey:requestKey.current,acknowledged:true
      });
      setOrderNumber(response.orderNumber);
      onCompleted();
    }catch(e){setError(e instanceof Error?e.message:'تعذر إرسال الطلب المبدئي.');}
    finally{setSubmitting(false);}
  }

  if(orderNumber)return <main className="container fahdan-checkout-success">
    <CheckCircle2 size={49}/><span className="section-kicker">فهدان للعود</span>
    <h1>تم استلام طلبك المبدئي</h1>
    <p>رقم الطلب: <strong dir="ltr">{orderNumber}</strong></p>
    <p>طلبك الآن <b>بانتظار مراجعة المتجر</b>، ولم يُخصم منك أي مبلغ، ولم يتم تأكيد المخزون أو قيمة الشحن.</p>
    <div className="fahdan-checkout-actions"><Link className="button dark" to="/account">متابعة الطلب في حسابي <ArrowLeft size={17}/></Link>
      <Link to="/">العودة إلى المتجر</Link></div>
  </main>;

  return <main className="container fahdan-checkout" dir="rtl">
    <div className="fahdan-checkout-heading"><span className="section-kicker">فهدان للعود • الخطوة التالية</span>
      <h1>مراجعة السلة وطلب الشراء</h1>
      <p>الطلبات في هذه المرحلة مبدئية وتنتظر مراجعة المتجر قبل تحديد المبلغ النهائي والدفع والشحن.</p>
    </div>
    {!cart.length?<div className="fahdan-checkout-empty"><Package size={38}/>
      <h2>سلة التسوق فارغة</h2><Link className="button dark" to="/">العودة إلى المنتجات</Link></div>:
    <div className="fahdan-checkout-layout">
      <section className="fahdan-checkout-details">
        <div className="fahdan-checkout-panel">
          <h2><Package size={20}/> المنتجات المختارة</h2>
          {cart.map(line=><div className="fahdan-checkout-line" key={line.sku}>
            <div><strong>{line.name}</strong><span>{line.label} — الكمية: {line.quantity}</span></div>
            <b>{formatPrice(line.price*line.quantity)}</b>
          </div>)}
          {!items&&<p className="fahdan-checkout-warning"><CircleAlert size={16}/>
            بعض الأصناف تجريبية أو لم تعد متاحة. لا يمكن إرسال طلب فعلي بها؛ عدّل السلة أولًا.</p>}
          <Link to="/" className="fahdan-checkout-return">العودة إلى التسوق وتعديل السلة</Link>
        </div>
        <div className="fahdan-checkout-panel">
          <h2><MapPin size={20}/> عنوان التوصيل وموقع المنزل</h2>
          {loading?<p>جارٍ تحميل عناوينك…</p>:addresses.length===0?
            <div className="fahdan-checkout-no-address">لم تحفظ عنوانًا بعد. أضف عنوان شحن وحدد مكان المنزل بالدبوس قبل إرسال الطلب.
              <Link to="/account">إضافة عنوان من حسابي <ArrowLeft size={16}/></Link></div>:
            <><div className="fahdan-checkout-addresses">
              {addresses.map(address=><label key={address.id} className={addressId===address.id?'selected':''}>
                <input type="radio" name="delivery-address" value={address.id} checked={addressId===address.id}
                  onChange={()=>{setAddressId(address.id);requestKey.current=crypto.randomUUID();}}/>
                <span><strong>{address.label} — {address.recipientName}</strong>
                  <small>{address.city}، {address.district}، {address.street} — {address.phone}</small>
                  {address.isDefault&&<em>العنوان الافتراضي</em>}
                </span>
              </label>)}
            </div>
            {locationReady?<div className="fahdan-checkout-location-ok"><CheckCircle2 size={17}/>
              موقع التسليم محفوظ مع العنوان. <a href={locationLink!} target="_blank" rel="noopener noreferrer">مراجعة الدبوس على الخريطة</a></div>:
              <p className="fahdan-checkout-warning"><CircleAlert size={16}/>
                العنوان المختار لا يحتوي على إحداثيات المنزل. يرجى تعديل العنوان وتحديد الدبوس.</p>}
            <Link to="/account" className="fahdan-checkout-return">تعديل أو إضافة عنوان في حسابي</Link>
            </>}
        </div>
      </section>
      <aside className="fahdan-checkout-summary">
        <h2><ClipboardCheck size={20}/> ملخص الطلب المبدئي</h2>
        {error&&<p className="fahdan-checkout-warning" role="alert">{error}</p>}
        {items&&!quote&&!error&&<p>جارٍ مراجعة الأسعار والمخزون في الخادم…</p>}
        {quote&&<><div className="fahdan-checkout-total"><span>مجموع المنتجات</span><strong>{formatPrice(quote.subtotalSar)}</strong></div>
          <div className="fahdan-checkout-total">
            <span>رسوم الشحن حسب المدينة</span>
            <b>{shippingEstimate?.estimateSar!==null&&shippingEstimate?.estimateSar!==undefined?
              formatPrice(shippingEstimate.estimateSar)+' (تقديري)':'تحدد بعد المراجعة'}</b>
          </div>
          <p className="fahdan-checkout-shipping-note">
            {shippingEstimate?.notice||'يُحدّد المتجر رسوم التوصيل قبل تأكيد الطلب.'}
            {' '}<Link to="/shipping-policy">سياسة الشحن والتوصيل</Link>
          </p>
          <div className="fahdan-checkout-total"><span>الضرائب والإجمالي النهائي</span><b>تحدد بعد المراجعة</b></div>
          <p className="fahdan-checkout-note">{quote.notice}</p>
        </>}
        <label className="fahdan-checkout-consent">
          <input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>
          <span>أفهم أن هذا طلب مبدئي للمراجعة، ولا يشكّل دفعًا أو تأكيدًا للشحن أو حجزًا نهائيًا للمنتجات.</span>
        </label>
        <button type="button" className="button dark block" onClick={sendRequest}
          disabled={loading||submitting||!items?.length||!quote||!locationReady||!accepted}>
          <ShieldCheck size={18}/>{submitting?'جارٍ إرسال الطلب…':'إرسال الطلب للمراجعة'}
        </button>
        <small className="fahdan-checkout-security"><Truck size={15}/> لن يتم تحصيل مبلغ أو إرسال الشحنة في هذه الخطوة.</small>
      </aside>
    </div>}
  </main>;
}
