import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
const AddressMap = lazy(() => import('./AddressMap').then(mod => ({ default: mod.AddressMap })));
import { ArrowLeft, ChevronLeft, CheckCircle2, Clock3, Edit3, Home, LogOut, Mail, MapPin, Package, Plus, Save, ShieldCheck, Trash2, Truck, UserRound, X } from 'lucide-react';
import {
  createCustomerAddress, defaultCustomerAddress, deleteCustomerAddress,
  getAccountProfile, getCustomerAddresses, getCustomerOrders,
  updateAccountProfile, updateCustomerAddress,
  type AccountProfile, type Customer, type CustomerAddress, type CustomerAddressInput, type CustomerOrder
} from '../api';

type Tab = 'overview'|'profile'|'addresses'|'orders';
const SESSION_KEY='fahdan-customer-session';
const emptyAddress:CustomerAddressInput={
  label:'المنزل',recipientName:'',phone:'',city:'',district:'',street:'',
  building:'',postalCode:'',additionalNumber:'',isDefault:false,
  latitude:null,longitude:null
};
const dateFormat=(value:string)=>new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium'}).format(new Date(value));
const currency=(s:string)=>new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR'}).format(Number(s));
const orderNames:Record<string,string>={
  PENDING_PAYMENT:'بانتظار الدفع',PAID:'تم الدفع',PREPARING:'جارٍ التجهيز',
  SHIPPED:'تم الشحن',DELIVERED:'تم التسليم',CANCELLED:'ملغي',
  RETURN_REQUESTED:'طلب استرجاع',RETURNED:'تم الاسترجاع'
};
const shipmentNames:Record<string,string>={
  NOT_CREATED:'لم تُشحن بعد',LABEL_CREATED:'تم إصدار بوليصة الشحن',
  IN_TRANSIT:'في الطريق',DELIVERED:'تم التسليم',RETURNED:'مرتجعة'
};

export function CustomerDashboard({onProfileUpdated,onLogout}:{
  onProfileUpdated:(updated:Customer)=>void;onLogout:()=>void
}) {
  const [tab,setTab]=useState<Tab>('overview');
  const [profile,setProfile]=useState<AccountProfile|null>(null);
  const [addresses,setAddresses]=useState<CustomerAddress[]>([]);
  const [orders,setOrders]=useState<CustomerOrder[]>([]);
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [editingAddress,setEditingAddress]=useState<string|null>(null);
  const [addressForm,setAddressForm]=useState<CustomerAddressInput|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const token=sessionStorage.getItem(SESSION_KEY);

  useEffect(()=>{
    if(!token){setLoading(false);return;}
    let active=true;
    Promise.all([
      getAccountProfile(token),getCustomerAddresses(token),getCustomerOrders(token)
    ]).then(([p,a,o])=>{
      if(!active)return;
      setProfile(p.user);setName(p.user.name);setPhone(p.user.phone||'');
      setAddresses(a.addresses);setOrders(o.orders);setLoading(false);
    }).catch(e=>{
      if(!active)return;
      setError(e instanceof Error?e.message:'تعذر تحميل بيانات حسابك.');
      setLoading(false);
    });
    return()=>{active=false};
  },[token]);

  function openTab(next:Tab){setTab(next);setError('');setNotice('');setAddressForm(null);setEditingAddress(null);}
  function openAddress(address?:CustomerAddress){
    setError('');setNotice('');
    if(address){
      setEditingAddress(address.id);
      setAddressForm({
        label:address.label,recipientName:address.recipientName,phone:address.phone,city:address.city,
        district:address.district,street:address.street,building:address.building||'',
        postalCode:address.postalCode||'',additionalNumber:address.additionalNumber||'',
        isDefault:address.isDefault,
        latitude:address.latitude,longitude:address.longitude
      });
    } else {
      setEditingAddress(null);
      setAddressForm({...emptyAddress,recipientName:profile?.name||'',phone:profile?.phone||''});
    }
  }
  async function reloadAddresses(){
    if(!token)return;
    const result=await getCustomerAddresses(token);
    setAddresses(result.addresses);
  }
  async function saveProfile(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!token)return;
    setSaving(true);setError('');setNotice('');
    try {
      const data=await updateAccountProfile(token,{name,phone});
      setProfile(data.user);setName(data.user.name);setPhone(data.user.phone||'');
      onProfileUpdated({id:data.user.id,name:data.user.name,email:data.user.email});
      setNotice('تم حفظ بياناتك الشخصية بنجاح.');
    }catch(e){setError(e instanceof Error?e.message:'تعذر حفظ البيانات.');}
    finally{setSaving(false);}
  }
  async function saveAddress(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!token||!addressForm)return;
    setSaving(true);setError('');setNotice('');
    try{
      if(editingAddress)await updateCustomerAddress(token,editingAddress,addressForm);
      else await createCustomerAddress(token,addressForm);
      await reloadAddresses();setAddressForm(null);setEditingAddress(null);
      setNotice('تم حفظ عنوان الشحن بنجاح.');
    }catch(e){setError(e instanceof Error?e.message:'تعذر حفظ العنوان.');}
    finally{setSaving(false);}
  }
  async function changeDefault(id:string){
    if(!token)return;
    setSaving(true);setError('');setNotice('');
    try{await defaultCustomerAddress(token,id);await reloadAddresses();setNotice('تم تحديث العنوان الافتراضي.');}
    catch(e){setError(e instanceof Error?e.message:'تعذر تحديث العنوان.');}
    finally{setSaving(false);}
  }
  async function removeAddress(id:string){
    if(!token||!window.confirm('هل تريد حذف هذا العنوان؟'))return;
    setSaving(true);setError('');setNotice('');
    try{await deleteCustomerAddress(token,id);await reloadAddresses();setNotice('تم حذف العنوان.');}
    catch(e){setError(e instanceof Error?e.message:'تعذر حذف العنوان.');}
    finally{setSaving(false);}
  }

  if(!token)return <main className="container account-need-login">
    <UserRound size={38}/><h1>حسابي في فهدان</h1>
    <p>يرجى تسجيل الدخول لعرض بياناتك وعناوين الشحن والطلبات الخاصة بك.</p>
    <Link className="button dark" to="/account/login">تسجيل الدخول <ArrowLeft size={18}/></Link>
  </main>;
  if(loading)return <main className="container account-loading" aria-live="polite">جارٍ تحميل بيانات حسابك…</main>;
  if(!profile)return <main className="container account-need-login">
    <ShieldCheck size={36}/><h1>تعذر فتح الحساب</h1>
    <p>{error||'يرجى تسجيل الدخول مرة أخرى.'}</p>
    <button className="button dark" onClick={onLogout}>العودة إلى تسجيل الدخول</button>
  </main>;

  const tabItems:{id:Tab;title:string;icon:typeof UserRound}[]=[
    {id:'overview',title:'نظرة عامة',icon:Home},
    {id:'profile',title:'بياناتي الشخصية',icon:UserRound},
    {id:'addresses',title:'عناوين الشحن',icon:MapPin},
    {id:'orders',title:'طلباتي',icon:Package}
  ];
  return <main className="account-page">
    <div className="container">
      <div className="account-crumb"><Link to="/">الرئيسية</Link><ChevronLeft size={14}/><span>حسابي</span></div>
      <div className="account-page-heading">
        <div><span className="section-kicker">فهدان للعود • حساب العملاء</span>
          <h1>أهلًا بك، {profile.name}</h1><p>كل ما تحتاج إليه لإدارة حسابك، في مكان واحد.</p></div>
        <div className="account-verified"><CheckCircle2 size={18}/> بريد إلكتروني موثّق</div>
      </div>
      <div className="account-layout">
        <aside className="account-sidebar">
          <div className="account-mini-profile"><span className="account-avatar"><UserRound size={24}/></span>
            <strong>{profile.name}</strong><small dir="ltr">{profile.email}</small></div>
          <nav className="account-tabs" aria-label="أقسام حسابي">
            {tabItems.map(item=><button type="button" key={item.id} className={tab===item.id?'active':''}
              aria-current={tab===item.id?'page':undefined} onClick={()=>openTab(item.id)}>
              <item.icon size={19}/><span>{item.title}</span><ChevronLeft size={15}/></button>)}
          </nav>
          <button className="account-signout" type="button" onClick={onLogout}><LogOut size={18}/> تسجيل الخروج</button>
        </aside>
        <section className="account-content" aria-live="polite">
          {error&&<p className="account-alert error" role="alert">{error}</p>}
          {notice&&<p className="account-alert success" role="status"><CheckCircle2 size={17}/>{notice}</p>}
          {tab==='overview'&&<>
            <div className="account-section-title"><div><span className="section-kicker">الملف الشخصي</span><h2>ملخص حسابي</h2></div></div>
            <div className="account-stat-grid">
              <div><Package size={23}/><strong>{orders.length}</strong><span>طلباتي المسجلة</span></div>
              <div><MapPin size={23}/><strong>{addresses.length}</strong><span>عناوين الشحن</span></div>
              <div><Clock3 size={23}/><strong>{dateFormat(profile.createdAt)}</strong><span>تاريخ الانضمام</span></div>
            </div>
            <div className="account-welcome">
              <h3>مرحبًا بك في عائلة فهدان</h3>
              <p>احفظ عناوينك لتسهيل الطلبات القادمة، وتابع مشترياتك من صفحة طلباتي عندما تُفعّل خدمة الطلب والدفع.</p>
              <div className="account-quick-links"><button onClick={()=>openTab('addresses')}><MapPin size={18}/> إدارة عناوين الشحن <ArrowLeft size={16}/></button>
                <button onClick={()=>openTab('orders')}><Package size={18}/> عرض طلباتي <ArrowLeft size={16}/></button></div>
            </div>
          </>}
          {tab==='profile'&&<>
            <div className="account-section-title"><div><span className="section-kicker">بياناتك</span><h2>البيانات الشخصية</h2></div><ShieldCheck size={24}/></div>
            <form className="account-form" onSubmit={saveProfile}>
              <label>الاسم الكامل<input required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
              <label>رقم الجوال<input dir="ltr" type="tel" inputMode="tel" placeholder="05xxxxxxxx" value={phone} onChange={e=>setPhone(e.target.value)} /></label>
              <label>البريد الإلكتروني<input dir="ltr" value={profile.email} disabled readOnly /></label>
              <p className="account-form-help"><Mail size={16}/> لا يمكن تعديل البريد الإلكتروني مباشرةً حفاظًا على توثيق الحساب.</p>
              <div className="account-form-actions"><button className="button dark" disabled={saving} type="submit">
                <Save size={17}/> {saving?'جارٍ الحفظ…':'حفظ التعديلات'}</button>
                <Link to="/account/forgot-password">تغيير كلمة المرور عبر البريد</Link></div>
            </form>
          </>}
          {tab==='addresses'&&<>
            <div className="account-section-title"><div><span className="section-kicker">عنوان التوصيل</span><h2>عناوين الشحن</h2></div>
              {!addressForm&&<button className="account-add-button" onClick={()=>openAddress()} disabled={saving||addresses.length>=10}><Plus size={18}/> إضافة عنوان</button>}</div>
            {addressForm?<form className="account-form" onSubmit={saveAddress}>
              <div className="account-form-header"><h3>{editingAddress?'تعديل العنوان':'إضافة عنوان جديد'}</h3>
                <button type="button" aria-label="إغلاق النموذج" onClick={()=>{setAddressForm(null);setEditingAddress(null);}}><X size={20}/></button></div>
              <div className="account-form-grid">
                {([
                  ['label','اسم العنوان (المنزل / العمل)'],['recipientName','اسم المستلم'],
                  ['phone','رقم الجوال'],['city','المدينة'],['district','الحي'],
                  ['street','اسم الشارع'],['building','رقم المبنى (اختياري)'],
                  ['postalCode','الرمز البريدي (اختياري)'],['additionalNumber','الرقم الإضافي (اختياري)']
                ] as [keyof CustomerAddressInput,string][]).map(([key,title])=>
                  <label key={key}>{title}<input
                    required={!['building','postalCode','additionalNumber'].includes(key)}
                    maxLength={key==='street'?160:key==='district'?100:key==='recipientName'||key==='city'?80:key==='label'?40:50}
                    inputMode={['phone','postalCode','additionalNumber'].includes(key)?'numeric':undefined}
                    value={String(addressForm[key])}
                    onChange={e=>setAddressForm({...addressForm,[key]:e.target.value})}/></label>
                )}
              </div>
              <Suspense fallback={<div className="account-map-placeholder">جارٍ تحميل الخريطة التفاعلية…</div>}>
                <AddressMap latitude={addressForm.latitude} longitude={addressForm.longitude}
                  onChange={point=>setAddressForm(current=>current?{...current,
                    latitude:point?.latitude??null,longitude:point?.longitude??null}:current)}/>
              </Suspense>
              <label className="account-checkbox"><input type="checkbox" checked={addressForm.isDefault}
                onChange={e=>setAddressForm({...addressForm,isDefault:e.target.checked})}/> تعيين عنوان افتراضي للتوصيل</label>
              <div className="account-form-actions"><button disabled={saving} className="button dark"><Save size={17}/>{saving?'جارٍ الحفظ…':'حفظ العنوان'}</button>
                <button type="button" className="account-muted-button" onClick={()=>setAddressForm(null)}>إلغاء</button></div>
            </form>:addresses.length? <div className="account-address-grid">{addresses.map(address=>
              <article className="account-address" key={address.id}>
                <div className="account-address-title"><strong><MapPin size={17}/>{address.label}</strong>{address.isDefault&&<span>العنوان الافتراضي</span>}</div>
                <p><b>{address.recipientName}</b></p>
                <p>{address.city}، {address.district}، {address.street}</p>
                {address.building&&<p>مبنى: {address.building}</p>}
                <p dir="ltr" className="account-phone">{address.phone}</p>
                {address.latitude!==null&&address.longitude!==null&&<a className="account-address-map-link"
                  href={`https://www.openstreetmap.org/?mlat=${address.latitude}&mlon=${address.longitude}#map=17/${address.latitude}/${address.longitude}`}
                  target="_blank" rel="noopener noreferrer"><MapPin size={15}/> عرض الموقع على الخريطة</a>}
                <div className="account-address-actions">
                  <button onClick={()=>openAddress(address)} disabled={saving}><Edit3 size={15}/> تعديل</button>
                  {!address.isDefault&&<button onClick={()=>changeDefault(address.id)} disabled={saving}>جعله الافتراضي</button>}
                  <button className="danger" onClick={()=>removeAddress(address.id)} disabled={saving}><Trash2 size={15}/> حذف</button>
                </div>
              </article>
            )}</div>:
              <div className="account-empty"><MapPin size={37}/><h3>لا توجد عناوين محفوظة</h3>
                <p>أضف عنوان التوصيل الأول ليكون جاهزًا لطلباتك القادمة.</p>
                <button className="button dark" onClick={()=>openAddress()}><Plus size={17}/> إضافة عنوان</button></div>}
            {addresses.length>=10&&<p className="account-form-help">الحد الأقصى للعناوين المحفوظة هو 10.</p>}
          </>}
          {tab==='orders'&&<>
            <div className="account-section-title"><div><span className="section-kicker">مشترياتك</span><h2>الطلبات السابقة</h2></div><Truck size={24}/></div>
            {orders.length? <div className="account-orders">{orders.map(order=>
              <details key={order.id} className="account-order">
                <summary><div><b>الطلب #{order.orderNumber}</b><small>{dateFormat(order.createdAt)}</small></div>
                  <span className="account-order-status">{orderNames[order.state]||order.state}</span>
                  <strong>{currency(order.totalSar)}</strong><ChevronLeft size={17}/></summary>
                <div className="account-order-detail">
                  {order.items.map(item=><div className="account-order-item" key={item.id}>
                    <span>{item.productNameAr} × {item.quantityItems}</span><b>{currency(item.totalPriceSar)}</b>
                  </div>)}
                  {order.delivery&&<div className="account-order-delivery">
                    <strong><MapPin size={16}/> عنوان التسليم المحفوظ مع الطلب</strong>
                    <p>{order.delivery.city}، {order.delivery.district}، {order.delivery.street}</p>
                    {order.delivery.latitude!==null&&order.delivery.longitude!==null
                      ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery.latitude+','+order.delivery.longitude)}`}
                          target="_blank" rel="noopener noreferrer">عرض موقع تسليم هذا الطلب على الخريطة</a>
                      : <small>لم تُحفظ إحداثيات التوصيل لهذا الطلب.</small>}
                  </div>}
                  {order.shipments.map((shipment,i)=><p key={i}><Truck size={16}/> {shipmentNames[shipment.state]||shipment.state}
                    {shipment.carrier?' — '+shipment.carrier:''}
                    {shipment.trackingCode?' — رقم التتبع: '+shipment.trackingCode:''}</p>)}
                </div>
              </details>)}</div>:
              <div className="account-empty"><Package size={38}/><h3>لا توجد طلبات حتى الآن</h3>
                <p>عندما تتاح خدمة إتمام الشراء، ستظهر طلباتك هنا مع حالة التجهيز والشحن.</p>
                <Link className="button dark" to="/">استكشف تشكيلة فهدان <ArrowLeft size={17}/></Link></div>}
          </>}
        </section>
      </div>
    </div>
  </main>;
}
