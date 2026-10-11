import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, MapPin, Package, Phone, RefreshCw, Truck } from 'lucide-react';
import { getAdminOrders, type AdminOrder, type DeliverySnapshot } from '../api';

const formatDate=(value:string)=>new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const sar=(value:string)=>new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR'}).format(Number(value));
const stateName:Record<string,string>={
  PENDING_PAYMENT:'بانتظار الدفع',PAID:'مدفوع',PREPARING:'جارٍ التجهيز',SHIPPED:'تم الشحن',
  DELIVERED:'تم التسليم',CANCELLED:'ملغي',RETURN_REQUESTED:'طلب استرجاع',RETURNED:'مرتجع'
};

export function locationUrl(delivery:DeliverySnapshot):string|null {
  if(delivery.latitude===null||delivery.longitude===null)return null;
  const lat=delivery.latitude,lng=delivery.longitude;
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return null;
  return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(lat+','+lng);
}

function addressText(delivery:DeliverySnapshot) {
  return [
    delivery.recipientName,
    delivery.phone,
    [delivery.city,delivery.district,delivery.street].filter(Boolean).join('، '),
    delivery.building?'مبنى: '+delivery.building:'',
    delivery.postalCode?'الرمز البريدي: '+delivery.postalCode:'',
    delivery.additionalNumber?'الرقم الإضافي: '+delivery.additionalNumber:'',
    locationUrl(delivery)?'رابط الموقع: '+locationUrl(delivery):''
  ].filter(Boolean).join('\n');
}

export function AdminOrders({token}:{token:string}) {
  const [orders,setOrders]=useState<AdminOrder[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [query,setQuery]=useState('');
  const [refresh,setRefresh]=useState(0);

  useEffect(()=>{
    let live=true;
    setLoading(true);setError('');
    getAdminOrders(token).then(({orders})=>{if(live){setOrders(orders);setLoading(false);}})
      .catch(e=>{if(live){setError(e instanceof Error?e.message:'تعذر تحميل الطلبات.');setLoading(false);}});
    return()=>{live=false;};
  },[token,refresh]);

  const visible=useMemo(()=>orders.filter(order=>
    [order.orderNumber,order.customerName,order.customerEmail||'',order.delivery?.city||'']
      .some(v=>v.toLowerCase().includes(query.trim().toLowerCase()))
  ),[orders,query]);

  async function copy(value:string,label:string){
    setNotice('');setError('');
    try{
      await navigator.clipboard.writeText(value);
      setNotice('تم نسخ '+label+'. أرسله فقط إلى شركة التوصيل المخوّلة.');
    }catch{setError('تعذر النسخ التلقائي. استخدم عرض الموقع لفتح رابط الملاحة.');}
  }

  return <section className="admin-panel admin-delivery-orders">
    <div className="panel-heading">
      <h2><Truck size={20}/> الطلبات وعناوين التسليم</h2>
      <span>{orders.length} طلب</span>
    </div>
    <p className="admin-shipping-intro">بيانات العنوان أدناه محفوظة ضمن الطلب نفسه؛ تغيير عنوان العميل لاحقًا لا يغيّر وجهة شحنة سابقة. مشاركة الرابط مع شركة الشحن تتم يدويًا وبعد اعتماد الشحنة.</p>
    <div className="admin-shipping-toolbar">
      <input aria-label="البحث في الطلبات" value={query} onChange={e=>setQuery(e.target.value)}
        placeholder="البحث برقم الطلب أو اسم العميل أو المدينة"/>
      <button type="button" onClick={()=>setRefresh(v=>v+1)} disabled={loading}><RefreshCw size={16}/> تحديث</button>
    </div>
    {notice&&<p className="admin-shipping-feedback success" role="status"><CheckCircle2 size={16}/>{notice}</p>}
    {error&&<p className="admin-shipping-feedback error" role="alert">{error}</p>}
    {loading?<div className="panel-empty">جارٍ تحميل الطلبات من PostgreSQL…</div>:
      !visible.length?<div className="panel-empty">
        <Package size={27}/>
        {query?'لا توجد طلبات مطابقة للبحث.':'لا توجد طلبات فعلية حتى الآن؛ تظهر بيانات الشحن هنا عند إنشاء طلبات حقيقية.'}
      </div>:
      <div className="admin-shipping-list">{visible.map(order=>{
        const destination=order.delivery;
        const map=destination?locationUrl(destination):null;
        return <article key={order.id} className="admin-shipping-card">
          <div className="admin-shipping-card-top">
            <div><strong>طلب #{order.orderNumber}</strong><small>{order.customerName} — {formatDate(order.createdAt)}</small></div>
            <span className="admin-shipping-status">{stateName[order.state]||order.state}</span>
            <b>{sar(order.totalSar)}</b>
          </div>
          {destination?<div className="admin-shipping-destination">
            <strong><MapPin size={16}/> عنوان التوصيل المعتمد وقت الطلب</strong>
            <p>{destination.recipientName} — {destination.city}، {destination.district}، {destination.street}</p>
            <p><Phone size={14}/>{destination.phone||order.guestPhone||'رقم الجوال غير متوفر'}</p>
            <div className="admin-shipping-actions">
              {map?<a href={map} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/> عرض موقع التسليم</a>:
                <span className="admin-no-coordinates">لا يحتوي هذا الطلب على إحداثيات مؤكدة</span>}
              {map&&<button type="button" onClick={()=>copy(map,'رابط الموقع')}><Copy size={15}/> نسخ رابط الموقع</button>}
              <button type="button" onClick={()=>copy(addressText(destination),'بيانات التسليم')}><Copy size={15}/> نسخ بيانات التسليم</button>
            </div>
          </div>:<p className="admin-no-coordinates">لا تتوفر تفاصيل عنوان محفوظة بصيغة مدعومة لهذا الطلب. لا تُنشئ بوليصة شحن قبل مراجعة العنوان.</p>}
        </article>;
      })}</div>}
    <small className="admin-shipping-note">هذه شاشة مراجعة وتجهيز الشحنات فقط. الربط الآلي مع شركة الشحن وإصدار البوليصة والدفع لم يُفعّل بعد.</small>
  </section>;
}
