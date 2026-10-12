import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { CheckCircle2, CircleAlert, ImagePlus, PackagePlus, Plus, Save, ShieldCheck, Trash2, UploadCloud, Images } from 'lucide-react';
import {
  createAdminProduct, getAdminProducts, setAdminProductPublishing, uploadAdminProductImage,
  ProductIntakeValidationError, type ProductIntakeIssue,
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
const MAX_PHOTOS=12;
const MAX_PHOTO_BYTES=6*1024*1024;
const imageTypes=['image/jpeg','image/png','image/webp'];
const fileKey=(file:File)=>file.name+'::'+file.size+'::'+file.lastModified;
type CreatedProduct={id:string;name:string;slug:string};

export function AdminProductIntake({token,revision,onUpdated}:{
  token:string;revision:number;onUpdated:()=>void
}) {
  const [form,setForm]=useState<NewProductIntake>(blank);
  const [products,setProducts]=useState<AdminProduct[]>([]);
  const [busy,setBusy]=useState(false);
  const [publishing,setPublishing]=useState('');
  const [error,setError]=useState('');
  const [validationIssues,setValidationIssues]=useState<ProductIntakeIssue[]>([]);
  const [notice,setNotice]=useState('');
  const [created,setCreated]=useState<CreatedProduct|null>(null);
  const [pendingUpload,setPendingUpload]=useState<CreatedProduct|null>(null);
  const [photos,setPhotos]=useState<File[]>([]);
  const [photoPreviews,setPhotoPreviews]=useState<string[]>([]);
  const [uploadProgress,setUploadProgress]=useState<{done:number;total:number}|null>(null);
  const kind=kinds.find(k=>k.value===form.kind)||kinds[0];
  const unit=units[kind.unit];
  const setField=<K extends keyof NewProductIntake>(key:K,value:NewProductIntake[K])=>{
    setForm(prev=>({...prev,[key]:value}));
    setValidationIssues(previous=>previous.filter(issue=>issue.field!==key&&
      !(key==='stockQuantity'&&issue.field==='variants')));
  };
  const setVariant=(index:number,key:keyof NewProductVariant,value:string)=>{
    setForm(prev=>({...prev,variants:prev.variants.map((item,i)=>i===index?{...item,[key]:value}:item)}));
    setValidationIssues(previous=>previous.filter(issue=>issue.field!==`variants.${index}.${key}`&&issue.field!=='variants'));
  };
  const invalid=(field:string)=>validationIssues.some(issue=>issue.field===field);
  function focusIssue(field:string){
    const elements=Array.from(document.querySelectorAll<HTMLElement>('[data-intake-field]'));
    const found=elements.find(el=>el.dataset.intakeField===field)||
      (field==='variants'?elements.find(el=>el.dataset.intakeField?.startsWith('variants.')):undefined);
    found?.scrollIntoView({behavior:'smooth',block:'center'});
    found?.focus({preventScroll:true});
  }

  useEffect(()=>{
    let active=true;
    getAdminProducts(token).then(data=>{if(active)setProducts(data);})
      .catch(()=>{if(active)setError('تعذر تحميل قائمة المنتجات.');});
    return()=>{active=false;};
  },[token,revision]);

  useEffect(()=>{
    const urls=photos.map(file=>URL.createObjectURL(file));
    setPhotoPreviews(urls);
    return()=>{urls.forEach(url=>URL.revokeObjectURL(url));};
  },[photos]);

  function choosePhotos(e:ChangeEvent<HTMLInputElement>) {
    const chosen=Array.from(e.currentTarget.files||[]);
    e.currentTarget.value='';
    if(!chosen.length)return;
    setError('');
    const invalid=chosen.find(file=>!imageTypes.includes(file.type)||file.size===0||file.size>MAX_PHOTO_BYTES);
    if(invalid){
      setError('الصورة «'+invalid.name+'» غير مدعومة. الصيغ JPG / PNG / WebP وبحجم أقصى 6 ميجابايت لكل صورة.');
      return;
    }
    const known=new Set(photos.map(fileKey));
    const unique=chosen.filter(file=>!known.has(fileKey(file))&&(known.add(fileKey(file)),true));
    if(photos.length+unique.length>MAX_PHOTOS){
      setError('يمكن اختيار 12 صورة كحد أقصى للمنتج؛ احذف بعض الصور ثم أعد الاختيار.');
      return;
    }
    if(!unique.length){
      setError('الصور المحددة موجودة بالفعل في قائمة الرفع.');
      return;
    }
    setPhotos(previous=>[...previous,...unique]);
  }

  async function uploadToCreatedProduct(product:CreatedProduct,queue:File[]) {
    if(!queue.length){
      setPendingUpload(null);
      setPhotos([]);
      setNotice('تم تسجيل «'+product.name+'» كمسودة. يمكنك إضافة الصور لاحقًا من مكتبة Google Drive، ثم نشر المنتج.');
      return;
    }
    setUploadProgress({done:0,total:queue.length});
    const failures:{file:File;reason:string}[]=[];
    let succeeded=0;
    for(const file of queue){
      try{
        await uploadAdminProductImage(token,product.id,file);
        succeeded++;
      }catch(err){
        failures.push({file,reason:err instanceof Error?err.message:'تعذر رفع الصورة'});
      }
      setUploadProgress({done:succeeded+failures.length,total:queue.length});
    }
    setUploadProgress(null);
    setPhotos(failures.map(item=>item.file));
    if(succeeded)onUpdated();
    if(failures.length){
      setPendingUpload(product);
      setNotice('تم حفظ المنتج «'+product.name+'» كمسودة، ورفع '+succeeded+' من '+queue.length+' صورة.');
      setError('تعذر رفع '+failures.length+' صورة: '+failures.map(f=>f.file.name+' ('+f.reason+')').join('، ')+'. يمكنك إعادة المحاولة دون إنشاء المنتج مرة أخرى.');
    }else{
      setPendingUpload(null);
      setNotice('تم حفظ «'+product.name+'» كمسودة ورفع '+succeeded+' صورة إلى Google Drive بنجاح. يمكنك الآن نشره من قائمة المنتجات.');
      setError('');
    }
  }

  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(busy||pendingUpload)return;
    setBusy(true);setError('');setValidationIssues([]);setNotice('');setCreated(null);
    try {
      const queue=[...photos];
      const result=await createAdminProduct(token,form);
      const product={id:result.product.id,name:result.product.nameAr,slug:result.product.slug};
      setCreated(product);
      // Save the product and its stock only once. Photos are a separate,
      // retryable step and never repeat inventory receipts.
      setForm(blank());
      onUpdated();
      await uploadToCreatedProduct(product,queue);
    } catch(e) {
      if(e instanceof ProductIntakeValidationError){
        setValidationIssues(e.issues);
        setError(e.message);
      }else{
        setError(e instanceof Error?e.message:'تعذر تسجيل المنتج.');
      }
    } finally {setBusy(false);}
  }

  async function retryPhotos() {
    if(!pendingUpload||busy)return;
    setBusy(true);setError('');
    try{await uploadToCreatedProduct(pendingUpload,[...photos]);}
    finally{setBusy(false);}
  }

  function continueWithoutPhotos() {
    if(!pendingUpload||busy)return;
    const name=pendingUpload.name;
    setPendingUpload(null);setPhotos([]);setError('');
    setNotice('المنتج «'+name+'» محفوظ كمسودة. يمكنك رفع الصور المتبقية لاحقًا من مكتبة Google Drive.');
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
    setValidationIssues([]);
  };

  return <section className="admin-panel fahdan-product-intake">
    <div className="panel-heading"><h2><PackagePlus size={20}/> إدخال المنتجات والمشتريات الفعلية</h2><span>للمدير فقط</span></div>
    <p className="fahdan-intake-intro">سجّل بيانات العود والمورد والكمية والتكلفة الفعلية وأسعار الأحجام. ينشئ النظام سجل شراء ودفعة مخزون وحركة استلام، ويحفظ المنتج مسودةً إلى أن ترفع صورته وتنشره.</p>
    {notice&&<p className="fahdan-intake-alert success" role="status"><CheckCircle2 size={18}/>{notice}</p>}
    {error&&<p className="fahdan-intake-alert warning" role="alert"><CircleAlert size={18}/>{error}</p>}
    {validationIssues.length>0&&<div className="fahdan-intake-validation-errors" role="alert">
      <strong>الحقول التي تحتاج إلى تصحيح ({validationIssues.length}):</strong>
      <ul>{validationIssues.map((issue,index)=><li key={issue.field+'-'+index}>
        <button type="button" onClick={()=>focusIssue(issue.field)}>
          {issue.message}
        </button>
      </li>)}</ul>
      <small>اضغط على أي ملاحظة للانتقال مباشرة إلى الحقل المرتبط بها. ستبقى الصور المحددة كما هي.</small>
    </div>}
    {created&&!pendingUpload&&<div className="fahdan-intake-next">
      <ImagePlus size={19}/><span>تم إنشاء «{created.name}». الصور الناجحة مرتبطة بالمنتج، ويمكنك نشره من قائمة المنتجات أدناه بعد التحقق من اكتماله.</span>
      <button type="button" className="fahdan-intake-upload-link" onClick={()=>
        document.getElementById('fahdan-product-images')?.scrollIntoView({behavior:'smooth',block:'start'})
      }><ImagePlus size={17}/> إدارة صور المنتج</button>
    </div>}
    {pendingUpload?<div className="fahdan-intake-pending">
      <h3><CircleAlert size={20}/> المنتج «{pendingUpload.name}» محفوظ بالفعل</h3>
      <p>بقيت {photos.length} صورة لم تُرفع إلى Google Drive. إعادة المحاولة ترفع هذه الصور فقط دون إنشاء منتج أو استلام مخزون جديد.</p>
      <div className="fahdan-inline-preview">
        {photos.map((file,i)=><div key={fileKey(file)}>
          {photoPreviews[i]&&<img src={photoPreviews[i]} alt={file.name}/>}
          <small title={file.name}>{file.name}</small>
        </div>)}
      </div>
      {uploadProgress&&<div className="fahdan-inline-upload-progress" role="status">
        <span>جارٍ إعادة الرفع: {uploadProgress.done} من {uploadProgress.total} مكتملة</span>
        <progress value={uploadProgress.done} max={uploadProgress.total}/>
      </div>}
      <div className="fahdan-intake-pending-actions">
        <button type="button" className="button dark" disabled={busy} onClick={retryPhotos}>
          <UploadCloud size={18}/>{busy?'جارٍ إعادة رفع الصور…':'إعادة رفع الصور المتبقية'}
        </button>
        <button type="button" disabled={busy} onClick={continueWithoutPhotos}>المتابعة دون الصور المتبقية</button>
      </div>
    </div>:<form className="fahdan-intake-form" onSubmit={submit}>
      <fieldset disabled={busy}><legend>1. بيانات المنتج</legend>
        <div className="fahdan-intake-grid">
          <label>اسم المنتج بالعربية *
            <input required minLength={3} maxLength={140} data-intake-field="nameAr" aria-invalid={invalid('nameAr')} value={form.nameAr}
              placeholder="الاسم التجاري الفعلي للعود" onChange={e=>setField('nameAr',e.target.value)}/>
          </label>
          <label>رمز الصنف الفريد (أحرف إنجليزية وأرقام) *
            <input required dir="ltr" minLength={3} maxLength={23} pattern="[A-Za-z0-9][A-Za-z0-9-]{2,22}"
              data-intake-field="code" aria-invalid={invalid('code')} value={form.code} placeholder="MRK-01" onChange={e=>setField('code',e.target.value.toUpperCase())}/>
          </label>
          <label>قسم المنتج *
            <select required data-intake-field="kind" aria-invalid={invalid('kind')} value={form.kind} onChange={e=>updateKind(e.target.value)}>
              {kinds.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label>بلد المنشأ
            <input maxLength={100} data-intake-field="originCountry" aria-invalid={invalid('originCountry')} value={form.originCountry} onChange={e=>setField('originCountry',e.target.value)}/>
          </label>
          <label>منطقة المنشأ
            <input maxLength={100} data-intake-field="originRegion" aria-invalid={invalid('originRegion')} value={form.originRegion} onChange={e=>setField('originRegion',e.target.value)}/>
          </label>
          <label>الدرجة / التصنيف
            <input maxLength={120} data-intake-field="grade" aria-invalid={invalid('grade')} value={form.grade} onChange={e=>setField('grade',e.target.value)}/>
          </label>
          <label>وصف الرائحة
            <input maxLength={500} data-intake-field="scentProfile" aria-invalid={invalid('scentProfile')} value={form.scentProfile} onChange={e=>setField('scentProfile',e.target.value)}/>
          </label>
          <label>قوة الفوحان (اختياري)
            <select data-intake-field="projectionScore" aria-invalid={invalid('projectionScore')} value={form.projectionScore??''} onChange={e=>setField('projectionScore',e.target.value?Number(e.target.value):null)}>
              <option value="">لم يحدد</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} من 5</option>)}
            </select>
          </label>
          <label>مستوى الثبات (اختياري)
            <select data-intake-field="longevityScore" aria-invalid={invalid('longevityScore')} value={form.longevityScore??''} onChange={e=>setField('longevityScore',e.target.value?Number(e.target.value):null)}>
              <option value="">لم يحدد</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} من 5</option>)}
            </select>
          </label>
          <label className="wide">وصف المنتج
            <textarea rows={3} maxLength={1800} data-intake-field="descriptionAr" aria-invalid={invalid('descriptionAr')} value={form.descriptionAr}
              onChange={e=>setField('descriptionAr',e.target.value)}/>
          </label>
        </div>
      </fieldset>
      <fieldset disabled={busy}><legend>2. استلام المستودع وتكلفة الشراء</legend>
        <p className="fahdan-intake-hint">أدخل بيانات شراء فعلية فقط. جميع التكاليف لا تظهر للعملاء. وحدة المخزون لهذا القسم: <b>{unit}</b>.</p>
        <div className="fahdan-intake-grid">
          <label>اسم المورد *
            <input required minLength={2} maxLength={160} data-intake-field="supplierName" aria-invalid={invalid('supplierName')} value={form.supplierName}
              onChange={e=>setField('supplierName',e.target.value)}/>
          </label>
          <label>بيانات تواصل المورد (اختياري)
            <input maxLength={160} data-intake-field="supplierContact" aria-invalid={invalid('supplierContact')} value={form.supplierContact}
              onChange={e=>setField('supplierContact',e.target.value)}/>
          </label>
          <label>تاريخ الاستلام *
            <input required type="date" data-intake-field="receivedAt" aria-invalid={invalid('receivedAt')} value={form.receivedAt} onChange={e=>setField('receivedAt',e.target.value)}/>
          </label>
          <label>مرجع فاتورة الشراء
            <input maxLength={100} data-intake-field="invoiceReference" aria-invalid={invalid('invoiceReference')} value={form.invoiceReference}
              onChange={e=>setField('invoiceReference',e.target.value)}/>
          </label>
          <label>الكمية المشتراة ({unit}) *
            <input required min="0.001" step={kind.unit==='PIECE'?'1':'0.001'} type="number"
              data-intake-field="stockQuantity" aria-invalid={invalid('stockQuantity')} value={form.stockQuantity} onChange={e=>setField('stockQuantity',e.target.value)}/>
          </label>
          <label>إجمالي تكلفة الشراء الفعلية (ر.س) *
            <input required type="number" min="0.01" step="0.01" data-intake-field="landedCostSar" aria-invalid={invalid('landedCostSar')} value={form.landedCostSar}
              onChange={e=>setField('landedCostSar',e.target.value)}/>
          </label>
          <label>حد تنبيه قرب النفاد ({unit}) *
            <input required type="number" min="0" step={kind.unit==='PIECE'?'1':'0.001'}
              data-intake-field="reorderPoint" aria-invalid={invalid('reorderPoint')} value={form.reorderPoint} onChange={e=>setField('reorderPoint',e.target.value)}/>
          </label>
        </div>
        <small>تكلفة الشراء المدخلة تشمل أي مصاريف مخصصة للمنتج مثل النقل والرسوم؛ لا تضف المصاريف مرتين.</small>
      </fieldset>
      <fieldset disabled={busy}><legend>3. أحجام البيع وأسعارها</legend>
        <p className="fahdan-intake-hint">أدخل سعرًا فعليًا لكل حجم تريد بيعه. لا تُنشئ المنصة سعرًا تلقائيًا من تكلفة الشراء.</p>
        <div className="fahdan-intake-variants">
          {form.variants.map((v,i)=><div className="fahdan-intake-variant" key={i}>
            <label>الحجم ({unit}) *
              <input required type="number" min="0.001" step={kind.unit==='PIECE'?'1':'0.001'}
                data-intake-field={`variants.${i}.quantity`} aria-invalid={invalid(`variants.${i}.quantity`)||invalid('variants')} value={v.quantity} onChange={e=>setVariant(i,'quantity',e.target.value)}/>
            </label>
            <label>سعر البيع (ر.س) *
              <input required type="number" step="0.01" min="0.01"
                data-intake-field={`variants.${i}.priceSar`} aria-invalid={invalid(`variants.${i}.priceSar`)||invalid('variants')} value={v.priceSar} onChange={e=>setVariant(i,'priceSar',e.target.value)}/>
            </label>
            <label>السعر قبل الخصم (اختياري)
              <input type="number" step="0.01" min="0.01"
                data-intake-field={`variants.${i}.compareAtPriceSar`} aria-invalid={invalid(`variants.${i}.compareAtPriceSar`)||invalid('variants')} value={v.compareAtPriceSar} onChange={e=>setVariant(i,'compareAtPriceSar',e.target.value)}/>
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
      <fieldset className="fahdan-intake-photo-step" disabled={busy}>
        <legend>4. صور المنتج — Google Drive</legend>
        <p className="fahdan-intake-hint">حدد صور المنتج الآن، وسيتم رفعها تلقائيًا بعد حفظ بيانات المنتج والمخزون. أول صورة يتم رفعها هي صورة الغلاف في المتجر.</p>
        <label className="fahdan-inline-photo-picker">
          <Images size={27}/>
          <strong>اختيار صور المنتج (أكثر من صورة)</strong>
          <span>JPG وPNG وWebP — حتى 6 ميجابايت للصورة — 12 صورة كحد أقصى</span>
          <input type="file" multiple accept="image/jpeg,image/png,image/webp"
            disabled={busy||photos.length>=MAX_PHOTOS}
            onChange={choosePhotos}/>
        </label>
        {photos.length>0&&<>
          <div className="fahdan-inline-photo-heading">
            <strong>الصور المحددة ({photos.length} من {MAX_PHOTOS})</strong>
            <button type="button" disabled={busy} onClick={()=>setPhotos([])}>إزالة جميع الصور</button>
          </div>
          <div className="fahdan-inline-preview">
            {photos.map((file,i)=><div key={fileKey(file)}>
              {photoPreviews[i]&&<img src={photoPreviews[i]} alt={file.name}/>}
              <small title={file.name}>{file.name}</small>
              <button type="button" disabled={busy} aria-label={`إزالة ${file.name}`}
                onClick={()=>setPhotos(current=>current.filter(x=>fileKey(x)!==fileKey(file)))}><Trash2 size={16}/></button>
            </div>)}
          </div>
        </>}
        <p className="fahdan-intake-hint">يمكن حفظ المنتج دون صور كمسودة، وإضافتها لاحقًا من مكتبة الصور. النشر يتطلب صورة واحدة على الأقل.</p>
      </fieldset>
      {uploadProgress&&<div className="fahdan-inline-upload-progress" role="status">
        <span>جارٍ رفع الصور: {uploadProgress.done} من {uploadProgress.total} مكتملة</span>
        <progress value={uploadProgress.done} max={uploadProgress.total}/>
      </div>}
      <div className="fahdan-intake-footer">
        <p><ShieldCheck size={17}/> حفظ المنتج أولًا، ثم رفع {photos.length} {photos.length===1?'صورة':'صور'} تلقائيًا، دون نشر المنتج قبل اعتمادك.</p>
        <button className="button dark" type="submit" disabled={busy}><Save size={18}/>{busy?'جارٍ الحفظ ورفع الصور…':'حفظ المنتج ورفع الصور'}</button>
      </div>
    </form>}
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
