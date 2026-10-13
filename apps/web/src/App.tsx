import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BadgeCheck, Box, Check, ChevronDown, Gift, LayoutDashboard, LockKeyhole, Menu, Minus, Plus, Search, ShieldCheck, ShoppingBag, Sparkles, UserRound, X } from 'lucide-react';
import { customerMe, getCatalog, getDashboard, signIn, type Customer } from './api';
import { ProductArt } from './components/ProductArt';
import { AdminWarehouse } from './components/AdminWarehouse';
import { AdminProductIntake } from './components/AdminProductIntake';
import { AdminProductReview } from './components/AdminProductReview';
import { AdminOrders } from './components/AdminOrders';
import { AdminReturns } from './components/AdminReturns';
import { CustomerAccount } from './components/CustomerAccount';
import { CustomerDashboard } from './components/CustomerDashboard';
import { CustomerCheckout } from './components/CustomerCheckout';
import { CustomerOrderDocument } from './components/CustomerOrderDocument';
import { ReturnsPolicy } from './components/ReturnsPolicy';
import { demoProducts, fallbackCategories } from './demo';
import type { CartLine, Dashboard, Product, Variant } from './types';

const CUSTOMER_SESSION_KEY = 'fahdan-customer-session';
const sar = (value:number) => new Intl.NumberFormat('ar-SA',{maximumFractionDigits:2}).format(value) + ' ر.س';
const whole = (value:number) => new Intl.NumberFormat('ar-SA',{maximumFractionDigits:0}).format(value);
const isDemoNotice = 'المحتوى والأسعار المعروضة في هذه النسخة تجريبية، وليست عرضًا للبيع. الدفع والشحن غير مفعلين.';
const readCart = ():CartLine[] => { try { const value=JSON.parse(localStorage.getItem('fahdan-cart')||'[]'); return Array.isArray(value)?value:[]; } catch { return []; } };

function Brand({inverse=false}:{inverse?:boolean}) {
  return <Link to="/" className={`brand ${inverse?'inverse':''}`} aria-label="فهدان للعود، الرئيسية">
    <img src="/mark.svg" alt="" className="brand-mark" />
    <span><strong>فهدان <em>للعود</em></strong><small>FAHDAN OUD</small></span>
  </Link>;
}
function Header({cartCount,openCart,customer,onLogout}:{cartCount:number;openCart:()=>void;customer:Customer|null;onLogout:()=>void}) {
  const [menu,setMenu] = useState(false);
  return <>
    <div className="announcement"><span className="gold-dot"/> متجر فهدان في مرحلة التطوير — تصفّح التجربة الأولى <span className="gold-dot"/></div>
    <header className="site-header"><div className="container header-inner">
      <Brand/>
      <nav className={menu?'nav-links open':'nav-links'} aria-label="القائمة الرئيسية">
        <Link onClick={()=>setMenu(false)} to="/">الرئيسية</Link>
        <Link onClick={()=>setMenu(false)} to="/#products">تشكيلة فهدان</Link>
        <Link onClick={()=>setMenu(false)} to="/#our-story">عن فهدان</Link>
        <Link onClick={()=>setMenu(false)} to="/account">حسابي</Link>
      </nav>
      <div className="header-tools">
        <button className="bag-button" aria-label={`فتح السلة: ${cartCount} منتجات`} onClick={openCart}><ShoppingBag size={21}/>{cartCount>0&&<span className="bag-count">{cartCount}</span>}</button>
        {customer
          ? <details className="header-customer-menu">
              <summary aria-label={`حساب ${customer.name}`} title={customer.name}>
                <UserRound size={19}/><span className="header-customer-name">{customer.name}</span><ChevronDown size={15}/>
              </summary>
              <div className="header-customer-popover" dir="rtl">
                <span className="header-customer-label">أهلًا بك في فهدان</span>
                <strong className="header-customer-fullname">{customer.name}</strong>
                <small className="header-customer-email" dir="ltr">{customer.email}</small>
                <Link to="/account" onClick={e=>{const details=e.currentTarget.closest('details');if(details)details.open=false;}}>حسابي</Link>
                <button type="button" onClick={onLogout}>تسجيل الخروج</button>
              </div>
            </details>
          : <Link className="header-admin" to="/account/login" aria-label="تسجيل الدخول أو إنشاء حساب"><UserRound size={20}/></Link>}
        <button className="mobile-menu" onClick={()=>setMenu(!menu)} aria-label={menu?'إغلاق القائمة':'فتح القائمة'}>{menu?<X size={23}/>:<Menu size={23}/>}</button>
      </div>
    </div></header>
  </>;
}
function ProductCard({p}:{p:Product}) {
  const price = p.variants.find(v=>v.quantityBase===28)?.price ?? p.variants[0]?.price;
  const picture = p.images[0]?.url;
  return <Link to={`/product/${encodeURIComponent(p.slug)}`} className="product-card">
    <div className={`product-image kind-${p.kind.toLowerCase()}`}>
      <span className="image-tag">{p.demo?'نموذج تجريبي':'من تشكيلة فهدان'}</span>
      {picture?<img className="real-product-image" src={picture} alt={p.images[0]?.altAr||p.name}/>:<ProductArt kind={p.kind}/>}
      <span className="card-arrow"><ArrowLeft size={20}/></span>
    </div>
    <div className="product-body">
      <div className="product-category">{p.category.nameAr}</div>
      <h3>{p.name}</h3>
      <p>{p.grade||'يحدد لاحقًا'} <span className="sep">·</span> {p.origin||'المنشأ يحدد لاحقًا'}</p>
      <div className="product-bottom"><div><small>{p.baseUnit==='PIECE'?'السعر المبدئي':'السعر يبدأ من'}</small><b>{price==null?'لم يحدد':sar(price)}</b></div><span className="mini-view">عرض التفاصيل <ArrowLeft size={15}/></span></div>
    </div>
  </Link>;
}
function Home({products,categories,connected}:{products:Product[];categories:{slug:string;nameAr:string}[];connected:boolean}) {
  const [category,setCategory] = useState('all');
  const [search,setSearch] = useState('');
  const [sort,setSort] = useState('featured');
  const list=useMemo(()=>{
    let result=products.filter(p=>(category==='all'||p.category.slug===category)&&(`${p.name} ${p.grade||''} ${p.origin||''} ${p.scent||''}`.includes(search.trim())));
    if(sort==='lowest')result=[...result].sort((a,b)=>(a.variants[0]?.price??Infinity)-(b.variants[0]?.price??Infinity));
    if(sort==='highest')result=[...result].sort((a,b)=>(b.variants[0]?.price??0)-(a.variants[0]?.price??0));
    return result;
  },[products,category,search,sort]);
  useEffect(()=>{ if(location.hash==='#products')document.getElementById('products')?.scrollIntoView({behavior:'smooth'}); },[]);
  return <>
    <section className="hero"><div className="hero-glow hero-glow-1"/><div className="hero-glow hero-glow-2"/>
      <div className="container hero-inner"><div className="hero-copy">
        <div className="eyebrow"><span/> أصالة الطيب في كل تفاصيله</div>
        <h1>من عبق الأصالة<br/><span>تبدأ حكاية فهدان.</span></h1>
        <p>نصوغ تجربة اقتناء العود والبخور بعناية؛ تفاصيل واضحة، وأوزان متعددة، ولمسة تليق بلحظات الضيافة والمناسبات.</p>
        <div className="hero-buttons"><a href="#products" className="button primary">استكشف التشكيلة <ArrowLeft size={18}/></a><a href="#our-story" className="button ghost">تعرّف علينا</a></div>
        <div className="hero-caption"><span className="star">✦</span> للطيب حكاية، ولفهدان أثر.</div>
      </div><div className="hero-visual"><div className="hero-orbit"/><div className="hero-art"><ProductArt kind="NATURAL_OUD" hero/></div><div className="hero-brand-seal"><img src="/mark.svg" alt=""/><span>FAHDAN<br/>OUD</span></div><span className="hero-floating-word">أثر يبقى</span></div></div>
    </section>
    <section className="benefits"><div className="container benefits-row">
      <div><BadgeCheck size={27}/><span><b>تفاصيل تهمّك</b><small>المنشأ والدرجة والوصف</small></span></div>
      <div><Box size={27}/><span><b>أوزان تناسب اختيارك</b><small>من الجرام إلى الكيلو</small></span></div>
      <div><Gift size={27}/><span><b>تجربة هدايا أنيقة</b><small>خيارات تغليف مستقبلية</small></span></div>
    </div></section>
    <section className="shop-section container" id="products"><div className="section-heading"><div><div className="section-kicker">منتقاة لعالم الطيب</div><h2>اكتشف <span>تشكيلة فهدان</span></h2><p>تصفح الأقسام والأوزان، واستعرض تجربة المنتج قبل تجهيز المتجر للإطلاق.</p></div><span className="product-counter">{whole(list.length)} منتجات معروضة</span></div>
      <div className="shop-toolbar"><div className="category-pills"><button className={category==='all'?'active':''} onClick={()=>setCategory('all')}>جميع المنتجات</button>{categories.map(c=><button key={c.slug} className={category===c.slug?'active':''} onClick={()=>setCategory(c.slug)}>{c.nameAr}</button>)}</div>
        <div className="search-sort"><label className="search-field"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث عن الطيب المفضل..." aria-label="البحث عن منتج"/></label><label className="sort-field"><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="ترتيب المنتجات"><option value="featured">ترتيب افتراضي</option><option value="lowest">السعر: الأقل</option><option value="highest">السعر: الأعلى</option></select><ChevronDown size={16}/></label></div>
      </div>
      {!connected&&<div className="notice-inline"><ShieldCheck size={16}/> يعمل المعرض حاليًا ببيانات محلية تجريبية. عند تشغيل API سيجلب المنتجات من PostgreSQL.</div>}
      {list.length?<div className="products-grid">{list.map(p=><ProductCard key={p.id} p={p}/>)}</div>:<div className="no-results"><Search size={28}/><h3>لا توجد منتجات مطابقة</h3><p>هذا القسم متاح في الهيكل، وستضاف منتجاته بعد تجهيز البيانات.</p><button className="button light" onClick={()=>{setSearch('');setCategory('all');}}>عرض كل المنتجات</button></div>}
    </section>
    <section className="story-section" id="our-story"><div className="container story-grid"><div className="story-art"><div className="story-art-inset"><img src="/mark.svg" alt="رمز فهدان"/><strong>فهدان</strong><span>FAHDAN OUD</span></div></div><div className="story-copy"><span className="section-kicker">عن العلامة</span><h2>الطيب ليس مجرد رائحة،<br/><span>بل أثر يُحكى.</span></h2><p>«فهدان للعود» وجهة مقترحة لتقديم العود والبخور بمعلومات واضحة عن الأصناف والأوزان والأوصاف، ضمن تجربة تسوق بسيطة وأنيقة.</p><p>سيُستكمل أصل تسمية «فهدان» وقصة العلامة من صاحب المشروع قبل اعتماد النص النهائي ونشره.</p><span className="story-quote">« للطيب حكاية، ولفهدان أثر. »</span></div></div></section>
  </>;
}
function ProductPage({products,add}:{products:Product[];add:(p:Product,v:Variant)=>boolean}) {
  const {slug}=useParams();const p=products.find(p=>p.slug===slug);const [variantId,setVariantId]=useState('');const [added,setAdded]=useState(false);const [imageIndex,setImageIndex]=useState(0);
  useEffect(()=>{setVariantId(p?.variants.find(v=>v.quantityBase===28)?.id||p?.variants[0]?.id||'');setAdded(false);setImageIndex(0);},[p?.id]);
  if(!p)return <main className="container missing"><h1>المنتج غير موجود</h1><Link className="button dark" to="/">العودة إلى المتجر <ArrowRight size={17}/></Link></main>;
  const variant=p.variants.find(v=>v.id===variantId)||p.variants[0];
  const totalStock=p.availableBase;
  const available=!!variant&&(p.preorder||totalStock>=variant.quantityBase);
  return <main className="container detail-page"><nav className="breadcrumb"><Link to="/">الرئيسية</Link><span>/</span><Link to="/#products">المنتجات</Link><span>/</span><b>{p.name}</b></nav>
    <div className="detail-grid"><div className="detail-media-column">
      <div className={`detail-visual kind-${p.kind.toLowerCase()}`}>
        <div className="detail-stamp">{p.demo?'منتج تجريبي':'من تشكيلة فهدان'}</div>
        {p.images.length
          ? <img className="real-product-image" src={p.images[imageIndex]?.url||p.images[0].url}
              alt={(p.images[imageIndex]?.altAr||p.name)+' — صورة '+(imageIndex+1)}/>
          : <ProductArt kind={p.kind}/>}
        <div className="detail-media-note">{p.images.length
          ? `الصورة ${Math.min(imageIndex+1,p.images.length)} من ${p.images.length}`
          : 'رسوم توضيحية وليست صورًا حقيقية للمنتج'}</div>
      </div>
      {p.images.length>1&&<div className="detail-gallery" aria-label="صور المنتج">
        {p.images.map((photo,i)=><button key={photo.url} type="button"
          className={i===imageIndex?'active':''}
          aria-label={`عرض صورة المنتج رقم ${i+1}`}
          aria-pressed={i===imageIndex} onClick={()=>setImageIndex(i)}>
          <img src={photo.url} loading="lazy" alt={photo.altAr||`صورة ${i+1}`}/>
        </button>)}
      </div>}
    </div>
      <div className="detail-copy"><div className="section-kicker">{p.category.nameAr}</div><h1>{p.name}</h1><p className="detail-desc">{p.description||'سيتم إضافة وصف المنتج عند اعتماد بياناته.'}</p>
        <div className="detail-tags"><span>المنشأ: {p.origin||'غير محدد'}</span><span>الدرجة: {p.grade||'غير محددة'}</span><span>{p.kind==='TREATED_OUD'?'مسقّى':'معلومات الصنف'}</span></div>
        <div className="scent"><b>وصف الرائحة</b><p>{p.scent||'سيضاف بعد اختبار واعتماد الصنف.'}</p></div>
        <div className="score-row"><div><span>قوة الفوحان</span><strong>{p.projection?`${p.projection} / 5`:'تحدد لاحقًا'}</strong></div><div><span>الثبات</span><strong>{p.longevity?`${p.longevity} / 5`:'يحدد لاحقًا'}</strong></div></div>
        <div className="choose-size"><label htmlFor="weight">اختر الحجم أو الكمية</label><select id="weight" value={variant?.id||''} onChange={e=>{setVariantId(e.target.value);setAdded(false);}}>{p.variants.map(v=><option key={v.id} value={v.id}>{v.label} — {sar(v.price)}</option>)}</select></div>
        <div className="purchase-box"><div><span>السعر المحدد</span><strong>{variant?sar(variant.price):'لم يحدد'}</strong><small>{available?'متوفر في البيانات الحالية':'غير متوفر بهذه الكمية'}</small></div><button className="button dark" disabled={!available||!variant} onClick={()=>{if(variant&&add(p,variant))setAdded(true);}}><ShoppingBag size={18}/>{added?'تمت الإضافة':'أضف للسلة'}</button></div>
        <div className="demo-note"><ShieldCheck size={18}/>{p.demo?'هذا منتج تجريبي ولا يمكن إتمام شرائه.':isDemoNotice}</div>
        {p.videos.length>0&&<div className="video-links">{p.videos.map(v=><a key={v.url} href={v.url} target="_blank" rel="noopener noreferrer">شاهد فيديو التبخير ↗</a>)}</div>}
      </div></div></main>;
}
function CartDrawer({cart,visible,close,change,remove}:{cart:CartLine[];visible:boolean;close:()=>void;change:(sku:string,diff:number)=>void;remove:(sku:string)=>void}) {
  const navigate=useNavigate();
  const total=cart.reduce((a,b)=>a+b.price*b.quantity,0);
  return <><div className={`cart-overlay ${visible?'visible':''}`} onClick={close}/><aside className={`cart-drawer ${visible?'visible':''}`} role="dialog" aria-modal="true" aria-label="سلة التسوق" aria-hidden={!visible}><div className="cart-top"><h2>سلة فهدان <span>({whole(cart.reduce((s,c)=>s+c.quantity,0))})</span></h2><button onClick={close} aria-label="إغلاق السلة"><X/></button></div>
    <div className="cart-list">{!cart.length?<div className="empty-cart"><ShoppingBag size={47}/><h3>سلتك بانتظار الطيب</h3><p>تصفح الأصناف وأضف ما يعجبك.</p><button className="button dark" onClick={close}>متابعة التسوق <ArrowLeft size={16}/></button></div>:cart.map(c=><div className="cart-line" key={c.sku}><div className="cart-thumb"><ProductArt kind={c.baseUnit==='PIECE'?'GIFT_BOX':'NATURAL_OUD'}/></div><div className="cart-line-info"><b>{c.name}</b><small>{c.label}</small><strong>{sar(c.price*c.quantity)}</strong><div className="qty-bar"><button onClick={()=>change(c.sku,-1)} aria-label={`إنقاص ${c.name}`}><Minus size={14}/></button><span>{whole(c.quantity)}</span><button onClick={()=>change(c.sku,1)} aria-label={`زيادة ${c.name}`}><Plus size={14}/></button><button className="delete-item" onClick={()=>remove(c.sku)}>حذف</button></div></div></div>)}</div>
    {!!cart.length&&<div className="cart-checkout"><div className="cart-subtotal"><b>المجموع التوضيحي</b><strong>{sar(total)}</strong></div><p>الشحن والضرائب لم تُحتسب بعد.</p><button className="button dark block" onClick={()=>{close();navigate("/checkout");}}><ArrowLeft size={17}/> مراجعة الطلب المبدئي</button><small>يمكن إرسال طلب مراجعة غير مدفوع، وتحدد رسوم الشحن والإجمالي النهائي لاحقًا.</small></div>}
  </aside></>;
}
function Admin() {
  const [token,setToken]=useState(()=>sessionStorage.getItem('fahdan-admin-token')||'');
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [dashboard,setDashboard]=useState<Dashboard|null>(null);
  const [revision,setRevision]=useState(0);
  const refreshProducts=()=>setRevision(v=>v+1);
  useEffect(()=>{if(!token){setDashboard(null);return;}let live=true;getDashboard(token).then(v=>{if(live)setDashboard(v);}).catch(()=>{if(live){setError('تعذر جلب لوحة الإدارة؛ تحقق من تشغيل API وقاعدة البيانات أو صلاحية الجلسة.');setToken('');sessionStorage.removeItem('fahdan-admin-token');}});return()=>{live=false;};},[token,revision]);
  const login=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);setError('');try{const data=await signIn(email,password);sessionStorage.setItem('fahdan-admin-token',data.token);setToken(data.token);setPassword('');}catch(err){setError(err instanceof Error?err.message:'تعذر تسجيل الدخول.');}finally{setBusy(false);}};
  const logout=()=>{sessionStorage.removeItem('fahdan-admin-token');setToken('');setDashboard(null);};
  if(!token)return <main className="admin-wrap container"><div className="admin-login"><div className="login-emblem"><LockKeyhole/></div><span className="section-kicker">إدارة فهدان</span><h1>دخول لوحة الإدارة</h1><p>بيانات الموردين والتكاليف المالية لا تظهر إلا لأصحاب الصلاحية.</p><form onSubmit={login}><label>البريد الإلكتروني<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="owner@example.com"/></label><label>كلمة المرور<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••••••"/></label><button className="button dark block" disabled={busy}>{busy?'جارٍ التحقق...':'دخول الإدارة'} <ArrowLeft size={16}/></button></form>{error&&<p className="form-error" role="alert">{error}</p>}<small>يجب تشغيل PostgreSQL والخادم وإنشاء حساب المالك من إعدادات البيئة أولًا.</small></div></main>;
  return <main className="container admin-wrap"><div className="admin-heading"><div><span className="section-kicker">نظام فهدان الداخلي</span><h1><LayoutDashboard/> لوحة إدارة المتجر</h1><p>مؤشرات مرتبطة بقاعدة البيانات وليست أرقامًا تقديرية.</p></div><button className="button light" onClick={logout}>تسجيل الخروج <ArrowRight size={16}/></button></div>
    {!dashboard?<div className="admin-loading">جارٍ قراءة المؤشرات من قاعدة البيانات…</div>:<><div className="admin-stats"><div><span>المنتجات الفعلية</span><strong>{whole(dashboard.totalProducts)}</strong><small>لا تشمل منتجات العرض التجريبية</small></div><div><span>الطلبات قيد المتابعة</span><strong>{whole(dashboard.openOrders)}</strong><small>قبل الإرسال أو الإكمال</small></div><div><span>الطلبات المدفوعة</span><strong>{whole(dashboard.paidOrders)}</strong><small>بحسب الحالات المسجلة</small></div><div><span>إجمالي المبيعات المدفوعة*</span><strong>{sar(dashboard.grossSalesSar)}</strong><small>ليس صافي الربح</small></div></div>
      <div className="admin-panels"><div className="admin-panel"><div className="panel-heading"><h2>تنبيهات المخزون</h2><span>{whole(dashboard.lowStock.length)} أصناف</span></div>{dashboard.lowStock.length?dashboard.lowStock.map((item,i)=><p key={i} className="stock-warning"><Box size={17}/> {item.name} — المتاح {whole(item.available)} {item.unit==='PIECE'?'قطعة':'وحدة أساسية'} (الحد {whole(item.threshold)})</p>):<div className="panel-empty"><Check size={27}/> لا توجد تنبيهات مخزون في الأصناف الفعلية حاليًا.</div>}</div><div className="admin-panel"><div className="panel-heading"><h2>وحدات الإدارة القادمة</h2><Sparkles size={18}/></div><ul className="roadmap-list"><li><Check size={16}/> دليل المنتجات والأوزان</li><li><Check size={16}/> تسجيل الموردين ودفعات الشراء</li><li><Check size={16}/> حركة المخزون وحجز الكميات</li><li><Check size={16}/> الطلبات والشحن والمدفوعات</li><li><Check size={16}/> تقارير الأرباح والمديونيات</li></ul><p className="panel-disclaimer">النماذج مهيأة في قاعدة البيانات؛ شاشات الإدخال والمعالجة المحاسبية لم تُنفذ بعد.</p></div></div></>}
    <AdminProductReview token={token} revision={revision} onUpdated={refreshProducts}/>
    <AdminProductIntake token={token} revision={revision} onUpdated={refreshProducts}/>
    <AdminWarehouse token={token} revision={revision} onUpdated={refreshProducts}/>
    <AdminOrders token={token}/>
    <AdminReturns token={token}/>
  </main>;
}
function Footer(){return <footer className="footer"><div className="container footer-main"><div><Brand inverse/><p>تجربة عصرية تنطلق من أصالة العود والبخور، وتمنح التفاصيل مكانتها.</p></div><div><h3>تصفح فهدان</h3><Link to="/">الرئيسية</Link><Link to="/#products">المنتجات</Link><Link to="/account">حسابي</Link><Link to="/returns-policy">الاستبدال والاسترجاع</Link></div><div><h3>معلومات المتجر</h3><span>التواصل: يحدد لاحقًا</span><span>الشحن: تحت الإعداد</span><span>الدفع: غير مفعل</span></div><div className="footer-letter"><span>FAHDAN</span><strong>للطيب حكاية</strong></div></div><div className="footer-bottom container"><span>© فهدان للعود — نسخة تطويرية 2026</span><span>بُنيت بعناية لتكبر مع فهدان</span></div></footer>}
export default function App(){
  const [products,setProducts]=useState<Product[]>(import.meta.env.PROD?[]:demoProducts),[categories,setCategories]=useState(fallbackCategories),[connected,setConnected]=useState(false);
  const [cart,setCart]=useState<CartLine[]>(readCart),[cartOpen,setCartOpen]=useState(false),[toast,setToast]=useState('');
  const [customer,setCustomer] = useState<Customer|null>(null);
  const [customerLoading,setCustomerLoading] = useState(()=>Boolean(sessionStorage.getItem(CUSTOMER_SESSION_KEY)));
  const navigate=useNavigate();
  const location=useLocation();
  useEffect(()=>{let live=true;getCatalog().then(data=>{if(live){setProducts(data.products);setCategories(data.categories);setConnected(data.connected);}});return()=>{live=false;};},[location.pathname]);
  useEffect(()=>{localStorage.setItem('fahdan-cart',JSON.stringify(cart));},[cart]);
  useEffect(()=>{
    const session=sessionStorage.getItem(CUSTOMER_SESSION_KEY);
    if(!session){setCustomerLoading(false);return;}
    let active=true;
    customerMe(session).then(({user})=>{
      if(active && sessionStorage.getItem(CUSTOMER_SESSION_KEY)===session){
        sessionStorage.removeItem('fahdan-admin-token');
        setCustomer(user);
      }
    }).catch(()=>{
      if(active && sessionStorage.getItem(CUSTOMER_SESSION_KEY)===session){
        sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
        setCustomer(null);
      }
    }).finally(()=>{if(active)setCustomerLoading(false);});
    return()=>{active=false;};
  },[]);
  const updateCustomer=(user:Customer)=>setCustomer(user);
  const signInCustomer=(user:Customer,token:string)=>{
    // Customer and owner sessions must never coexist in this browser tab.
    sessionStorage.removeItem('fahdan-admin-token');
    sessionStorage.setItem(CUSTOMER_SESSION_KEY,token);
    setCustomer(user);
    setCustomerLoading(false);
  };
  const logoutCustomer=()=>{
    sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
    setCustomer(null);
    setCustomerLoading(false);
    navigate('/account/login');
  };
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),2500);return()=>clearTimeout(t);},[toast]);
  const add=(p:Product,v:Variant)=>{
    const existing=cart.filter(x=>x.productId===p.id).reduce((n,x)=>n+x.quantity*x.quantityBase,0);
    if(!p.preorder&&existing+v.quantityBase>p.availableBase){setToast('هذه الكمية تتجاوز الرصيد المعروض.');return false;}
    const prior=cart.find(x=>x.sku===v.sku);
    setCart(prev=>prior?prev.map(x=>x.sku===v.sku?{...x,quantity:x.quantity+1}:x):[...prev,{sku:v.sku,productId:p.id,slug:p.slug,name:p.name,label:v.label,quantityBase:v.quantityBase,price:v.price,quantity:1,baseUnit:p.baseUnit,demo:p.demo}]);
    setToast('تمت الإضافة إلى السلة التجريبية');setCartOpen(true);return true;
  };
  const change=(sku:string,diff:number)=>{
    setCart(prev=>{
      const current=prev.find(x=>x.sku===sku);if(!current)return prev;
      if(current.quantity+diff<=0)return prev.filter(x=>x.sku!==sku);
      if(diff>0){const product=products.find(p=>p.id===current.productId);
        const used=prev.filter(x=>x.productId===current.productId).reduce((n,x)=>n+x.quantity*x.quantityBase,0);
        if(product&&!product.preorder&&used+current.quantityBase>product.availableBase){setToast('الكمية تتجاوز المخزون.');return prev;}}
      return prev.map(x=>x.sku===sku?{...x,quantity:x.quantity+diff}:x);
    });
  };
  return <div className="app"><Header cartCount={cart.reduce((n,x)=>n+x.quantity,0)} openCart={()=>setCartOpen(true)} customer={customer} onLogout={logoutCustomer}/><Routes><Route path="/" element={<Home products={products} categories={categories} connected={connected}/>}/><Route path="/product/:slug" element={<ProductPage products={products} add={add}/>}/><Route path="/account/login" element={<CustomerAccount view="login" customer={customer} onSignIn={signInCustomer} onSignOut={logoutCustomer}/>}/>
<Route path="/account/register" element={<CustomerAccount view="register" customer={customer} onSignIn={signInCustomer} onSignOut={logoutCustomer}/>}/>
<Route path="/account/forgot-password" element={<CustomerAccount view="forgot-password" customer={customer} onSignIn={signInCustomer} onSignOut={logoutCustomer}/>}/>
<Route path="/account/reset-password" element={<CustomerAccount view="reset-password" customer={customer} onSignIn={signInCustomer} onSignOut={logoutCustomer}/>}/>
<Route path="/account/verify" element={<CustomerAccount view="verify" customer={customer} onSignIn={signInCustomer} onSignOut={logoutCustomer}/>}/>
<Route path="/account" element={customerLoading?<main className="container account-loading">جارٍ التحقق من جلسة حسابك…</main>:customer?<CustomerDashboard onProfileUpdated={updateCustomer} onLogout={logoutCustomer}/>:<Navigate to="/account/login" replace/>}/>
<Route path="/returns-policy" element={<ReturnsPolicy/>}/>
<Route path="/account/orders/:id/document" element={customerLoading?<main className="container account-loading">جارٍ التحقق من حسابك…</main>:customer?<CustomerOrderDocument/>:<Navigate to="/account/login" replace/>}/>
<Route path="/checkout" element={customerLoading?<main className="container account-loading">جارٍ التحقق من حسابك…</main>:customer?<CustomerCheckout cart={cart} products={products} onCompleted={()=>setCart([])}/>:<Navigate to="/account/login" replace/>}/>
<Route path="/admin" element={customerLoading?<main className="container account-loading">جارٍ التحقق من صلاحية الجلسة…</main>:customer?<Navigate to="/account" replace/>:<Admin/>}/><Route path="*" element={<main className="container missing"><h1>الصفحة غير موجودة</h1><button className="button dark" onClick={()=>navigate('/')}>العودة للرئيسية</button></main>}/></Routes><Footer/><CartDrawer cart={cart} visible={cartOpen} close={()=>setCartOpen(false)} change={change} remove={sku=>setCart(prev=>prev.filter(x=>x.sku!==sku))}/>{toast&&<div className="toast" role="status"><Check size={17}/>{toast}</div>}</div>;
}
