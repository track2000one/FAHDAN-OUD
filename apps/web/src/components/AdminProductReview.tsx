import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AdminStockOperations } from './AdminStockOperations';
import { CheckCircle2, ClipboardCheck, EyeOff, Image as ImageIcon, PackageCheck, Pencil, RefreshCw, ShieldCheck, AlertTriangle, ArrowRight, ArrowLeft, Star, Trash2 } from 'lucide-react';
import {
  getAdminReviewPhoto, getAdminReviewProducts, saveAdminReviewProduct,
  reorderAdminProductPhotos, removeAdminProductPhoto,
  setAdminProductPublishing, type AdminReviewEdit, type AdminReviewProduct
} from '../api';

type ReviewFilter='pending'|'published'|'all';
const unitText:Record<string,string>={GRAM:'جم',MILLILITER:'مل',PIECE:'قطعة'};
const stateText:Record<string,string>={
  DRAFT:'بانتظار اعتماد المدير',ACTIVE:'منشور للعملاء',
  OUT_OF_STOCK:'غير متوفر',ARCHIVED:'مؤرشف'
};
function draftFor(product:AdminReviewProduct):AdminReviewEdit{
  return {
    nameAr:product.nameAr,originCountry:product.originCountry,
    originRegion:product.originRegion,grade:product.grade,
    scentProfile:product.scentProfile,descriptionAr:product.descriptionAr,
    projectionScore:product.projectionScore,longevityScore:product.longevityScore,
    variants:product.variants.map(v=>({id:v.id,priceSar:v.priceSar,compareAtPriceSar:v.compareAtPriceSar}))
  };
}
const price=(value:string)=>new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR'}).format(Number(value));
const day=(value:string)=>new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium'}).format(new Date(value));

function ReviewImage({token,productId,id,alt}:{token:string;productId:string;id:string;alt:string}){
  const [url,setUrl]=useState('');
  useEffect(()=>{
    let live=true;let objectUrl='';
    getAdminReviewPhoto(token,productId,id).then(blob=>{
      if(!live)return;
      objectUrl=URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(()=>{if(live)setUrl('');});
    return()=>{live=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[token,productId,id]);
  return <div className="fahdan-review-photo">
    {url?<img src={url} alt={alt} loading="lazy"/>:<span><ImageIcon size={23}/> الصورة غير متاحة للمعاينة</span>}
  </div>;
}

export function AdminProductReview({token,revision,onUpdated}:{
  token:string;revision:number;onUpdated:()=>void
}){
  const [products,setProducts]=useState<AdminReviewProduct[]>([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState<ReviewFilter>('pending');
  const [selectedId,setSelectedId]=useState('');
  const [form,setForm]=useState<AdminReviewEdit|null>(null);
  const [checked,setChecked]=useState({details:false,photos:false,prices:false});
  const [busy,setBusy]=useState(false);
  const [photoBusy,setPhotoBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [reload,setReload]=useState(0);

  useEffect(()=>{
    let live=true;setLoading(true);
    getAdminReviewProducts(token).then(data=>{
      if(!live)return;
      setProducts(data.products);
      setSelectedId(previous=>data.products.some(p=>p.id===previous)?previous:
        (filter==='pending'?data.products.find(p=>p.state==='DRAFT')?.id:
          filter==='published'?data.products.find(p=>p.state==='ACTIVE')?.id:data.products[0]?.id)||'');
    }).catch(err=>{if(live)setError(err instanceof Error?err.message:'تعذر تحميل المنتجات للمراجعة.');})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[token,revision,reload]);

  const selected=products.find(p=>p.id===selectedId);
  useEffect(()=>{
    setForm(selected?draftFor(selected):null);
    setChecked({details:false,photos:false,prices:false});
  },[selected?.id,selected?.updatedAt]);

  const counts=useMemo(()=>({
    pending:products.filter(p=>p.state==='DRAFT').length,
    published:products.filter(p=>p.state==='ACTIVE').length
  }),[products]);
  const listed=products.filter(p=>filter==='all'||(filter==='pending'?p.state==='DRAFT':p.state==='ACTIVE'));
  const editable=selected?.state==='DRAFT'&&!busy;
  const available=Number(selected?.availableBase||0);
  const canSell=!!selected?.variants.some(v=>v.active&&Number(v.quantityBase)<=available&&Number(v.priceSar)>0);
  const complete=!!selected&&!!selected.nameAr.trim()&&selected.photos.length>0&&available>0&&canSell;
  const allChecked=checked.details&&checked.photos&&checked.prices;
  const changed=!!selected&&!!form&&JSON.stringify(form)!==JSON.stringify(draftFor(selected));

  function editField<K extends keyof Omit<AdminReviewEdit,'variants'>>(key:K,value:AdminReviewEdit[K]){
    setForm(current=>current?{...current,[key]:value}:current);
    setChecked(old=>({...old,details:false}));
    setNotice('');
  }
  function editPrice(i:number,key:'priceSar'|'compareAtPriceSar',value:string){
    setForm(current=>current?{...current,variants:current.variants.map((v,j)=>
      i===j?{...v,[key]:value}:v)}:current);
    setChecked(old=>({...old,prices:false}));
    setNotice('');
  }
  function selectProduct(id:string){
    setSelectedId(id);setError('');setNotice('');
    setChecked({details:false,photos:false,prices:false});
  }
  async function refresh(){
    setError('');setNotice('');setReload(v=>v+1);
  }
  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!form||!selected||busy||selected.state!=='DRAFT')return;
    setError('');setNotice('');setBusy(true);
    try{
      const result=await saveAdminReviewProduct(token,selected.id,form);
      setNotice(result.message);
      onUpdated();
    }catch(err){setError(err instanceof Error?err.message:'تعذر حفظ التصحيحات.');}
    finally{setBusy(false);}
  }
  async function approve(){
    if(!selected||busy||selected.state!=='DRAFT'||changed||!complete||!allChecked)return;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await setAdminProductPublishing(token,selected.id,'ACTIVE',true);
      setNotice(result.message);
      setChecked({details:false,photos:false,prices:false});
      onUpdated();
    }catch(err){setError(err instanceof Error?err.message:'تعذر اعتماد المنتج.');}
    finally{setBusy(false);}
  }
  async function unpublish(){
    if(!selected||busy||selected.state!=='ACTIVE')return;
    if(!window.confirm('سيُخفى هذا المنتج فورًا من المتجر. هل تريد إيقاف نشره؟'))return;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await setAdminProductPublishing(token,selected.id,'DRAFT');
      setNotice(result.message);
      onUpdated();
    }catch(err){setError(err instanceof Error?err.message:'تعذر إيقاف النشر.');}
    finally{setBusy(false);}
  }


  async function reorderPhotos(photoId:string,move:'cover'|'up'|'down'){
    if(!selected||selected.state!=='DRAFT'||busy||photoBusy)return;
    const ids=selected.photos.map(p=>p.id);
    const from=ids.indexOf(photoId);
    if(from<0)return;
    const to=move==='cover'?0:move==='up'?from-1:from+1;
    if(to<0||to>=ids.length||from===to)return;
    const next=[...ids];
    next.splice(from,1);next.splice(to,0,photoId);
    setError('');setNotice('');setPhotoBusy(true);
    try{
      const result=await reorderAdminProductPhotos(token,selected.id,next);
      setNotice(result.message);
      setChecked(old=>({...old,photos:false}));
      onUpdated();
    }catch(err){setError(err instanceof Error?err.message:'تعذر تغيير ترتيب الصور.');}
    finally{setPhotoBusy(false);}
  }
  async function deletePhoto(photoId:string){
    if(!selected||selected.state!=='DRAFT'||busy||photoBusy)return;
    if(!window.confirm('سيتم حذف الصورة من هذا المنتج ومحاولة حذفها من Google Drive. هل تريد المتابعة؟'))return;
    setError('');setNotice('');setPhotoBusy(true);
    try{
      const result=await removeAdminProductPhoto(token,selected.id,photoId);
      setNotice(result.message);
      setChecked(old=>({...old,photos:false}));
      onUpdated();
    }catch(err){setError(err instanceof Error?err.message:'تعذر حذف الصورة.');}
    finally{setPhotoBusy(false);}
  }

  return <section id="fahdan-product-review" className="admin-panel fahdan-review-panel">
    <div className="panel-heading">
      <h2><ClipboardCheck size={21}/> مراجعة واعتماد المنتجات قبل عرضها للعملاء</h2>
      <button type="button" className="fahdan-review-refresh" disabled={loading||busy} onClick={refresh}>
        <RefreshCw size={15}/> تحديث
      </button>
    </div>
    <p className="fahdan-review-intro">كل منتج يُسجَّل أولًا كمسودة داخل لوحة الإدارة. لا يظهر في الصفحة الرئيسية أو صفحة المنتج أو السلة العامة حتى يراجعه المدير ويضغط «اعتماد ونشر المنتج».</p>
    <div className="fahdan-review-stats">
      <button className={filter==='pending'?'selected':''} onClick={()=>{setFilter('pending');setSelectedId(products.find(p=>p.state==='DRAFT')?.id||'');}}>
        <span>بانتظار الاعتماد</span><strong>{counts.pending}</strong>
      </button>
      <button className={filter==='published'?'selected':''} onClick={()=>{setFilter('published');setSelectedId(products.find(p=>p.state==='ACTIVE')?.id||'');}}>
        <span>معتمدة ومنشورة</span><strong>{counts.published}</strong>
      </button>
      <button className={filter==='all'?'selected':''} onClick={()=>{setFilter('all');setSelectedId(products[0]?.id||'');}}>
        <span>جميع المنتجات</span><strong>{products.length}</strong>
      </button>
    </div>
    {error&&<div className="fahdan-review-alert error" role="alert"><AlertTriangle size={17}/>{error}</div>}
    {notice&&<div className="fahdan-review-alert success" role="status"><CheckCircle2 size={17}/>{notice}</div>}
    {loading?<p className="fahdan-review-empty">جارٍ جلب المنتجات المسجلة من قاعدة البيانات…</p>:
      !products.length?<p className="fahdan-review-empty">لا توجد منتجات فعلية مسجلة بعد. أدخل أول منتج من قسم «إدخال المنتجات والمشتريات» الموجود أدناه.</p>:
      <div className="fahdan-review-layout">
        <nav className="fahdan-review-list" aria-label="المنتجات المطلوب مراجعتها">
          {listed.length?listed.map(p=>
            <button key={p.id} id={`fahdan-review-${p.id}`} type="button"
              className={selectedId===p.id?'selected':''} onClick={()=>selectProduct(p.id)}>
              <strong>{p.nameAr}</strong>
              <small>{p.variants.length} أحجام — {p.photos.length} صور — {day(p.createdAt)}</small>
              <span className={p.state==='ACTIVE'?'published':'pending'}>{stateText[p.state]||p.state}</span>
            </button>
          ):<p className="fahdan-review-empty">لا توجد منتجات ضمن هذا التصنيف.</p>}
        </nav>
        {selected&&listed.some(p=>p.id===selected.id)&&form?<div className="fahdan-review-details" key={selected.id}>
          <div className="fahdan-review-heading"><div>
            <h3>{selected.nameAr}</h3>
            <small>رمز المنتج: {selected.slug} — أُضيف بتاريخ {day(selected.createdAt)}</small>
          </div><span className={selected.state==='ACTIVE'?'published':'pending'}>{stateText[selected.state]}</span></div>
          <div className="fahdan-review-photos fahdan-product-photo-manager">
            {selected.photos.length?selected.photos.map((photo,i)=><div className="fahdan-product-photo-tile" key={photo.id}>
              <ReviewImage token={token} productId={selected.id} id={photo.id}
                alt={photo.altAr||`صورة المنتج ${i+1}`}/>
              <small>{i===0?'صورة الغلاف الرئيسية':`الصورة رقم ${i+1}`}</small>
              {selected.state==='DRAFT'&&<div className="fahdan-product-photo-actions">
                {i>0&&<button type="button" title="تعيين الصورة كغلاف" aria-label="تعيين كغلاف"
                  disabled={photoBusy||busy} onClick={()=>reorderPhotos(photo.id,'cover')}><Star size={15}/></button>}
                {i>0&&<button type="button" title="تحريك الصورة للأمام" aria-label="تحريك للأمام"
                  disabled={photoBusy||busy} onClick={()=>reorderPhotos(photo.id,'up')}><ArrowRight size={15}/></button>}
                {i<selected.photos.length-1&&<button type="button" title="تحريك الصورة للخلف" aria-label="تحريك للخلف"
                  disabled={photoBusy||busy} onClick={()=>reorderPhotos(photo.id,'down')}><ArrowLeft size={15}/></button>}
                <button type="button" className="danger" title="حذف الصورة" aria-label="حذف الصورة"
                  disabled={photoBusy||busy} onClick={()=>deletePhoto(photo.id)}><Trash2 size={15}/></button>
              </div>}
            </div>):<p className="fahdan-review-warning">لم تُرفَع صور لهذا المنتج بعد. ارفع صورة واحدة على الأقل عبر مكتبة Google Drive قبل الاعتماد.</p>}
          </div>
          <p className="fahdan-review-photo-hint">{selected.state==='DRAFT'
            ? 'يمكنك تحديد الغلاف بالنجمة، وتغيير ترتيب الصور أو حذف صورة. يُحفظ الترتيب مباشرة، وتبقى الصور غير منشورة حتى الاعتماد.'
            : 'لإعادة ترتيب صور المنتج أو استبدالها، أوقف نشره مؤقتًا ثم أعد اعتماده بعد مراجعة الصور.'}</p>
          <div className="fahdan-review-stock">
            <div><small>الرصيد المتاح</small><strong>{selected.availableBase} {unitText[selected.baseUnit]||selected.baseUnit}</strong></div>
            <div><small>الحد الأدنى للتنبيه</small><strong>{selected.reorderPoint} {unitText[selected.baseUnit]||selected.baseUnit}</strong></div>
            <div><small>إجمالي الرصيد</small><strong>{selected.onHandBase} {unitText[selected.baseUnit]||selected.baseUnit}</strong></div>
          </div>
          {selected.purchase&&<div className="fahdan-review-purchase">
            <strong>معلومات الاستلام والمشتريات — داخلية للإدارة فقط</strong>
            <p>المورد: {selected.purchase.supplierName} | المستلم: {selected.purchase.quantityBase} {unitText[selected.baseUnit]||selected.baseUnit}</p>
            <p>إجمالي تكلفة الشراء: {price(selected.purchase.totalCostSar)} | تاريخ الاستلام: {day(selected.purchase.receivedAt)}</p>
            <small>تصحيح كميات المخزون أو تكاليف المشتريات يتم بحركات مستودع مستقلة، وليس من شاشة مراجعة المنتج.</small>
          </div>}
          <form className="fahdan-review-form" onSubmit={save}>
            <h4><Pencil size={17}/> مراجعة وتصحيح بيانات المنتج</h4>
            <div className="fahdan-review-fields">
              <label>اسم المنتج *<input required minLength={3} maxLength={140} value={form.nameAr}
                disabled={!editable} onChange={e=>editField('nameAr',e.target.value)}/></label>
              <label>بلد المنشأ<input maxLength={100} value={form.originCountry}
                disabled={!editable} onChange={e=>editField('originCountry',e.target.value)}/></label>
              <label>منطقة المنشأ<input maxLength={100} value={form.originRegion}
                disabled={!editable} onChange={e=>editField('originRegion',e.target.value)}/></label>
              <label>الدرجة / التصنيف<input maxLength={120} value={form.grade}
                disabled={!editable} onChange={e=>editField('grade',e.target.value)}/></label>
              <label>وصف الرائحة<input maxLength={500} value={form.scentProfile}
                disabled={!editable} onChange={e=>editField('scentProfile',e.target.value)}/></label>
              <label>قوة الفوحان<select value={form.projectionScore??''} disabled={!editable}
                onChange={e=>editField('projectionScore',e.target.value?Number(e.target.value):null)}>
                <option value="">لم يحدد</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} من 5</option>)}</select></label>
              <label>مستوى الثبات<select value={form.longevityScore??''} disabled={!editable}
                onChange={e=>editField('longevityScore',e.target.value?Number(e.target.value):null)}>
                <option value="">لم يحدد</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} من 5</option>)}</select></label>
              <label className="full">وصف المنتج<textarea rows={3} maxLength={1800} value={form.descriptionAr}
                disabled={!editable} onChange={e=>editField('descriptionAr',e.target.value)}/></label>
            </div>
            <h4>مراجعة أحجام البيع وأسعارها</h4>
            <div className="fahdan-review-variants">
              {selected.variants.map((variant,i)=><div className="fahdan-review-variant" key={variant.id}>
                <strong>{variant.labelAr}<small>SKU: {variant.sku}</small></strong>
                <label>سعر البيع (ر.س)<input required inputMode="decimal" type="number" min="0.01" step="0.01"
                  value={form.variants[i]?.priceSar||''} disabled={!editable}
                  onChange={e=>editPrice(i,'priceSar',e.target.value)}/></label>
                <label>السعر قبل الخصم (اختياري)<input inputMode="decimal" type="number" min="0.01" step="0.01"
                  value={form.variants[i]?.compareAtPriceSar||''} disabled={!editable}
                  onChange={e=>editPrice(i,'compareAtPriceSar',e.target.value)}/></label>
              </div>)}
            </div>
            {selected.state==='DRAFT'&&<button className="fahdan-review-save" disabled={!changed||busy} type="submit">
              {busy?'جارٍ الحفظ…':'حفظ تصحيحات المنتج والأسعار'}
            </button>}
          </form>
          <AdminStockOperations token={token} product={selected} onUpdated={onUpdated}/>
          {selected.state==='DRAFT'?<div className="fahdan-review-approval">
            <h4><ShieldCheck size={18}/> قائمة تدقيق اعتماد النشر</h4>
            {!complete&&<p className="fahdan-review-warning">لا يمكن الاعتماد حتى تتوفر صورة للمنتج، ورصيد فعلي، وحجم مسعّر قابل للبيع.</p>}
            {changed&&<p className="fahdan-review-warning">لديك تعديلات غير محفوظة. اضغط «حفظ تصحيحات المنتج والأسعار» قبل الاعتماد.</p>}
            <label><input type="checkbox" disabled={busy} checked={checked.details}
              onChange={e=>setChecked(old=>({...old,details:e.target.checked}))}/>
              راجعت اسم المنتج والمنشأ والوصف وتأكدت من صحتها.</label>
            <label><input type="checkbox" disabled={busy} checked={checked.photos}
              onChange={e=>setChecked(old=>({...old,photos:e.target.checked}))}/>
              راجعت صور المنتج وتأكدت من أنها تخص الصنف المسجل.</label>
            <label><input type="checkbox" disabled={busy} checked={checked.prices}
              onChange={e=>setChecked(old=>({...old,prices:e.target.checked}))}/>
              راجعت الأحجام والأسعار والمخزون المتاح للبيع.</label>
            <button type="button" className="fahdan-review-approve"
              disabled={busy||!allChecked||!complete||changed} onClick={approve}>
              <PackageCheck size={19}/> {busy?'جارٍ اعتماد المنتج…':'اعتماد ونشر المنتج للعملاء'}
            </button>
            <small>لا يظهر الصنف للعملاء إلا بعد تنفيذ الاعتماد في الخادم، ويُسجّل الإجراء باسم حساب المدير.</small>
          </div>:selected.state==='ACTIVE'?<div className="fahdan-review-active">
            <CheckCircle2 size={19}/> المنتج معتمد وظاهر للعملاء في المتجر.
            <button type="button" disabled={busy} onClick={unpublish}><EyeOff size={16}/> إيقاف النشر وإعادته للمراجعة</button>
          </div>:<p className="fahdan-review-warning">هذه الحالة لا يمكن اعتمادها من هذه الشاشة. راجع وضع الصنف في النظام.</p>}
        </div>:<div className="fahdan-review-empty">اختر منتجًا من القائمة لعرض تفاصيل المراجعة.</div>}
      </div>}
  </section>;
}
