import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, CircleAlert, ImagePlus, PackagePlus, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import {
  createAdminProduct, getAdminProducts, setAdminProductPublishing,
  type AdminProduct, type NewProductIntake, type NewProductVariant
} from '../api';

const kinds = [
  {value:'NATURAL_OUD',label:'عود طبيعي',unit:'GRAM'},
  {value:'TREATED_OUD',label:'عود مسقّى',unit:'GRAM'},
  {value:'BAKHOOR',label:'بخور',unit:'GRAM'},
  {value:'OUD_OIL',label:'دهن عود',unit:'MILLILITER'},
  {value:'FRANKINCENSE',label:'لبان وعلق ألبان',unit:'GRAM'},
  {value:'GIFT_BOX',label:'هدايا وبكجات',unit:'PIECE'},
  {value:'PERFUME',label:'عطور',unit:'MILLILITER'},
  {value:'OTHER',label:'منتجات أخرى',unit:'PIECE'}
];
const newVariant = ():NewProductVariant=>({quantity:'',priceSar:'',compareAtPriceSar:''});
function blank():NewProductIntake {
  return {
    code:'',nameAr:'',kind:'NATURAL_OUD',originCountry:'',originRegion:'',
    grade:'',scentProfile:'',descriptionAr:'',projectionScore:null,longevityScore:null,
    supplierName:'',supplierContact:'',receivedAt:'',invoiceReference:'',
    stockQuantity:'',landedCostSar:'',reorderPoint:'0',variants:[newVariant()]
  };
}
const units:Record<string,string>={GRAM:'جم',MILLILITER:'مل',PIECE:'قطعة'};
const pretty=(n:number)=>new Intl.NumberFormat('ar-SA',{maximumFractionDigits:3}).format(n);

export function AdminProductIntake({token,revision,onUpdated}:{
  token:string;revision:number;onUpdated:()=>void
}) {
  const [form,setForm]=useState<NewProductIntake>(blank);
  const [products,setProducts]=useState<AdminProduct[]>([]);
  const [busy,setBusy]=useState(false);
  const [publishing,setPublishing]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [created,setCreated]=useState<{name:string;slug:string}|null>(null);
  const kind=kinds.find(k=>k.value===form.kind)||kinds[0];
  const unit=units[kind.unit];
  const setField=<K extends keyof NewProductIntake>(key:K,value:NewProductIntake[K])=>
    setForm(prev=>({...prev,[key]:value}));
  const setVariant=(index:number,key:keyof NewProductVariant,value:string)=>
    setForm(prev=>({...prev,variants:prev.variants.map((item,i)=>i===index?{...item,[key]:value}:item)}));

  useEffect(()=>{
    let active=true;
    getAdminProducts(token).then(data=>{if(active)setProducts(data);})
      .catch(()=>{if(active)setError('تعذر تحميل قائمة المنتجات.');});
    return()=>{active=false;};
  },[token,revision]);

  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setError('');setNotice('');setCreated(null);
    try {
      const result=await createAdminProduct(token,form);
      setNotice(result.message);
      setCreated({name:result.product.nameAr,slug:result.product.slug});
      setForm(blank());
      onUpdated();
    } catch(e) {setError(e instanceof Error?e.message:'تعذر تسجيل المنتج.');}
    finally {setBusy(false);}
  }

  async function changePublishing(product:AdminProduct){
    setPublishing(product.id);setError('');setNotice('');
    try{
      const next=product.status==='ACTIVE'?'DRAFT':'ACTIVE';
      const result=await setAdminProductPublishing(token,product.id,next);
      setNotice(result.message);
      onUpdated();
    }catch(e){setError(e instanceof Error?e.message:'تعذر تغيير حالة النشر.');}
    finally{setPublishing('');}
  }

  const updateKind=(value:string)=>{
    setForm(prev=>({...prev,kind:value,variants:[newVariant()]}));
  };

  return <section className="admin-panel fahdan-product-intake">
    <div className="panel-heading"><h2><PackagePlus size={20}/> إدخال المنتجات والمشتريات الفعلية</h2><span>للمدير فقط</span></div>
    <p className="fahdan-intake-intro">سجّل بيانات العود والمورد والكمية والتكلفة الفعلية وأسعار الأحجام. ينشئ النظام سجل شراء ودفعة مخزون وحركة استلام، ويحفظ المنتج مسودةً إلى أن ترفع صورته وتنشره.</p>
    {notice&&<p className="fahdan-intake-alert success" role="status"><CheckCircle2 size={18}/>{notice}</p>}
    {error&&<p className="fahdan-intake-alert warning" role="alert"><CircleAlert size={18}/>{error}</p>}
    {created&&<div className="fahdan-intake-next">
      <ImagePlus size={19}/><span>تم إنشاء «{created.name}». يمكنك رفع عدة صور له إلى Google Drive، ثم نشره من قائمة المنتجات هنا.</span>
      <button type="button" className="fahdan-intake-upload-link" onClick={()=>
        document.getElementById('fahdan-product-images')?.scrollIntoView({behavior:'smooth',block:'start'})
      }><ImagePlus size={17}/> رفع صور المنتج</button>
    </div>}
    <form className="fahdan-intake-form" onSubmit={submit}>
      <fieldset><legend>1. بيانات المنتج</legend>
        <div className="fahdan-intake-grid">
          <label>اسم المنتج بالعربية *
            <input required minLength={3} maxLength={140} value={form.nameAr}
              placeholder="الاسم التجاري الفعلي للعود" onChange={e=>setField('nameAr',e.target.value)}/>
          </label>
          <label>رمز الصنف الفريد (أحرف إنجليزية وأرقام) *
            <input required dir="ltr" minLength={3} maxLength={23} pattern="[A-Za-z0-9][A-Za-z0-9-]{2,22}"
              value={form.code} placeholder="MRK-01" onChange={e=>setField('code',e.target.value.toUpperCase())}/>
          </label>
          <label>قسم المنتج *
            <select required value={form.kind} onChange={e=>updateKind(e.target.value)}>
              {kinds.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label>بلد المنشأ
            <input maxLength={100} value={form.originCountry} onChange={e=>setField('originCountry',e.target.value)}/>
          </label>
          <label>منطقة المنشأ
            <input maxLength={100} value={form.originRegion} onChange={e=>setField('originRegion',e.target.value)}/>
          </label>
          <label>الدرجة / التصنيف
            <input maxLength={120} value={form.grade} onChange={e=>setField('grade',e.target.value)}/>
          </label>
          <label>وصف الرائحة
            <input maxLength={500} value={form.scentProfile} onChange={e=>setField('scentProfile',e.target.value)}/>
          </label>
          <label>قوة الفوحان (اختياري)
            <select value={form.projectionScore??''} onChange={e=>setField('projectionScore',e.target.value?Number(e.target.value):null)}>
              <option value="">لم يحدد</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} من 5</option>)}
            </select>
          </label>
          <label>مستوى الثبات (اختياري)
            <select value={form.longevityScore??''} onChange={e=>setField('longevityScore',e.target.value?Number(e.target.value):null)}>
              <option value="">لم يحدد</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} من 5</option>)}
            </select>
          </label>
          <label className="wide">وصف المنتج
            <textarea rows={3} maxLength={1800} value={form.descriptionAr}
              onChange={e=>setField('descriptionAr',e.target.value)}/>
          </label>
        </div>
      </fieldset>
      <fieldset><legend>2. استلام المستودع وتكلفة الشراء</legend>
        <p className="fahdan-intake-hint">أدخل بيانات شراء فعلية فقط. جميع التكاليف لا تظهر للعملاء. وحدة المخزون لهذا القسم: <b>{unit}</b>.</p>
        <div className="fahdan-intake-grid">
          <label>اسم المورد *
            <input required minLength={2} maxLength={160} value={form.supplierName}
              onChange={e=>setField('supplierName',e.target.value)}/>
          </label>
          <label>بيانات تواصل المورد (اختياري)
            <input maxLength={160} value={form.supplierContact}
              onChange={e=>setField('supplierContact',e.target.value)}/>
          </label>
          <label>تاريخ الاستلام *
            <input required type="date" value={form.receivedAt} onChange={e=>setField('receivedAt',e.target.value)}/>
          </label>
          <label>مرجع فاتورة الشراء
            <input maxLength={100} value={form.invoiceReference}
              onChange={e=>setField('invoiceReference',e.target.value)}/>
          </label>
          <label>الكمية المشتراة ({unit}) *
            <input required min="0.001" step={kind.unit==='PIECE'?'1':'0.001'} type="number"
              value={form.stockQuantity} onChange={e=>setField('stockQuantity',e.target.value)}/>
          </label>
          <label>إجمالي تكلفة الشراء الفعلية (ر.س) *
            <input required type="number" min="0.01" step="0.01" value={form.landedCostSar}
              onChange={e=>setField('landedCostSar',e.target.value)}/>
          </label>
          <label>حد تنبيه قرب النفاد ({unit}) *
            <input required type="number" min="0" step={kind.unit==='PIECE'?'1':'0.001'}
              value={form.reorderPoint} onChange={e=>setField('reorderPoint',e.target.value)}/>
          </label>
        </div>
        <small>تكلفة الشراء المدخلة تشمل أي مصاريف مخصصة للمنتج مثل النقل والرسوم؛ لا تضف المصاريف مرتين.</small>
      </fieldset>
      <fieldset><legend>3. أحجام البيع وأسعارها</legend>
        <p className="fahdan-intake-hint">أدخل سعرًا فعليًا لكل حجم تريد بيعه. لا تُنشئ المنصة سعرًا تلقائيًا من تكلفة الشراء.</p>
        <div className="fahdan-intake-variants">
          {form.variants.map((v,i)=><div className="fahdan-intake-variant" key={i}>
            <label>الحجم ({unit}) *
              <input required type="number" min="0.001" step={kind.unit==='PIECE'?'1':'0.001'}
                value={v.quantity} onChange={e=>setVariant(i,'quantity',e.target.value)}/>
            </label>
            <label>سعر البيع (ر.س) *
              <input required type="number" step="0.01" min="0.01"
                value={v.priceSar} onChange={e=>setVariant(i,'priceSar',e.target.value)}/>
            </label>
            <label>السعر قبل الخصم (اختياري)
              <input type="number" step="0.01" min="0.01"
                value={v.compareAtPriceSar} onChange={e=>setVariant(i,'compareAtPriceSar',e.target.value)}/>
            </label>
            <button type="button" aria-label="حذف الحجم" title="حذف الحجم"
              disabled={form.variants.length===1}
              onClick={()=>setField('variants',form.variants.filter((_,j)=>j!==i))}><Trash2 size={17}/></button>
          </div>)}
        </div>
        <button type="button" className="fahdan-add-variant" disabled={form.variants.length>=12}
          onClick={()=>setField('variants',[...form.variants,newVariant()])}><Plus size={16}/> إضافة حجم آخر</button>
        {kind.unit==='GRAM'&&<p className="fahdan-intake-hint">أحجام شائعة: 10، 20، 28 (أوقية)، 36، 50، 100، 125 (ثمن)، 250، 500، 1000 جم. أضف المتوفر فعليًا فقط.</p>}
      </fieldset>
      <div className="fahdan-intake-footer">
        <p><ShieldCheck size={17}/> يحفظ الصنف مسودة، ولا يظهر للعملاء حتى ترفع صورته وتضغط «نشر».</p>
        <button className="button dark" type="submit" disabled={busy}><Save size={18}/>{busy?'جارٍ تسجيل الشراء…':'حفظ المنتج واستلام المخزون'}</button>
      </div>
    </form>
    <div className="fahdan-intake-existing">
      <div className="panel-heading"><h3>المنتجات المسجلة وحالة النشر</h3><span>{products.length} أصناف</span></div>
      {!products.length?<p className="fahdan-intake-hint">لم تُسجّل أصناف فعلية بعد.</p>:<div className="fahdan-intake-product-list">
        {products.map(p=><div key={p.id} className="fahdan-intake-product-row">
          <div><strong>{p.name}</strong><small>رصيد {pretty(p.onHand-p.reserved)} {units[p.unit]} · {p.variantCount} أحجام · {p.imageCount} صور</small></div>
          <span className={p.status==='ACTIVE'?'fahdan-active':'fahdan-draft'}>{p.status==='ACTIVE'?'منشور':'مسودة'}</span>
          <button type="button" disabled={!!publishing|| (p.status!=='ACTIVE'&&p.imageCount===0)}
            onClick={()=>changePublishing(p)}>{publishing===p.id?'جارٍ الحفظ…':p.status==='ACTIVE'?'إيقاف النشر':'نشر المنتج'}</button>
        </div>)}
      </div>}
      <small className="fahdan-intake-hint">قبل نشر المسودة ارفع صورة واحدة على الأقل من قسم Google Drive التالي، وتأكد من وجود كمية تكفي أحد أحجام البيع.</small>
    </div>
  </section>;
}
