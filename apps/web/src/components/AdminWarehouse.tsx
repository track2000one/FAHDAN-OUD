import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { CheckCircle2, CircleAlert, ImagePlus, Images, Trash2, UploadCloud } from 'lucide-react';
import { getAdminProducts, getDriveStatus, uploadAdminProductImage, type AdminProduct } from '../api';

const MAX_PRODUCT_PHOTOS=12;
const MAX_FILE_BYTES=6*1024*1024;
const ALLOWED_TYPES=['image/jpeg','image/png','image/webp'];
const fileKey=(file:File)=>file.name+'::'+file.size+'::'+file.lastModified;

export function AdminWarehouse({token,revision,onUpdated}:{token:string;revision:number;onUpdated:()=>void}) {
  const [products,setProducts] = useState<AdminProduct[]>([]);
  const [selected,setSelected] = useState('');
  const [files,setFiles] = useState<File[]>([]);
  const [previews,setPreviews] = useState<string[]>([]);
  const [ready,setReady] = useState(false);
  const [folderUrl,setFolderUrl] = useState<string|null>(null);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [progress,setProgress] = useState<{completed:number;total:number}|null>(null);

  const product=useMemo(()=>products.find(p=>p.id===selected),[products,selected]);
  const remaining=Math.max(0,MAX_PRODUCT_PHOTOS-(product?.imageCount||0));

  useEffect(() => {
    let active = true;
    Promise.allSettled([getAdminProducts(token),getDriveStatus(token)]).then(results => {
      if (!active) return;
      const productsResult=results[0];
      const driveResult=results[1];
      if(productsResult.status==='fulfilled'){
        setProducts(productsResult.value);
        setSelected(prev=>productsResult.value.some(p=>p.id===prev)?prev:productsResult.value[0]?.id||'');
      } else setError('تعذر تحميل المستودع. أعد المحاولة.');
      if(driveResult.status==='fulfilled'){
        setReady(driveResult.value.authorized);
        setFolderUrl(driveResult.value.folderUrl);
        if(!driveResult.value.authorized)setError('ربط صور Google Drive لم يُعتمد بعد.');
      } else setError('تعذر التحقق من صلاحية Google Drive. راجع التفويض.');
    });
    return () => {active = false;};
  },[token,revision]);

  useEffect(()=>{
    const urls=files.map(file=>URL.createObjectURL(file));
    setPreviews(urls);
    return()=>{urls.forEach(url=>URL.revokeObjectURL(url));};
  },[files]);

  function onSelectFiles(e:ChangeEvent<HTMLInputElement>) {
    const incoming=Array.from(e.currentTarget.files||[]);
    e.currentTarget.value='';
    setMessage('');setError('');
    if(!incoming.length)return;
    const invalid=incoming.find(file=>!ALLOWED_TYPES.includes(file.type)||file.size===0||file.size>MAX_FILE_BYTES);
    if(invalid){
      setError('الملف «'+invalid.name+'» غير مدعوم. اختر JPG أو PNG أو WebP بحجم لا يتجاوز 6 ميجابايت لكل صورة.');
      return;
    }
    const existing=new Set(files.map(fileKey));
    const unique=incoming.filter(file=>!existing.has(fileKey(file)) && (existing.add(fileKey(file)),true));
    if(files.length+unique.length>remaining){
      setError(`يمكن إضافة ${Math.max(0,remaining-files.length)} صور أخرى لهذا المنتج (الحد الأقصى ${MAX_PRODUCT_PHOTOS} صورة).`);
      return;
    }
    if(!unique.length){setError('الصور المحددة موجودة بالفعل في قائمة الرفع.');return;}
    setFiles(prev=>[...prev,...unique]);
  }

  function changeProduct(id:string) {
    setSelected(id);setFiles([]);setMessage('');setError('');setProgress(null);
  }

  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!files.length||!selected||!ready||busy) return;
    const selectedId=selected;
    const queue=[...files];
    setBusy(true);setError('');setMessage('');setProgress({completed:0,total:queue.length});
    let successful=0;
    const failures:{file:File;reason:string}[]=[];
    try{
      // Sequential requests preserve image order and limit Google Drive traffic.
      for(const file of queue){
        try{
          await uploadAdminProductImage(token,selectedId,file);
          successful++;
        }catch(err){
          failures.push({file,reason:err instanceof Error?err.message:'تعذر رفع الصورة'});
        }
        setProgress({completed:successful+failures.length,total:queue.length});
      }
      if(successful)onUpdated();
      setFiles(failures.map(item=>item.file));
      if(successful)setMessage(`تم رفع ${successful} ${successful===1?'صورة':'صور'} بنجاح إلى Google Drive وربطها بالمنتج.`);
      if(failures.length)setError(`تعذر رفع ${failures.length} من الصور: ${failures.map(item=>item.file.name+' ('+item.reason+')').join('، ')}. ستبقى الصور غير المرفوعة محددة لإعادة المحاولة.`);
    }finally{
      setBusy(false);setProgress(null);
    }
  }

  const n=(value:number)=>new Intl.NumberFormat('ar-SA',{maximumFractionDigits:2}).format(value);
  return <>
    <div className="admin-panel" style={{marginTop:'1.5rem'}}>
      <div className="panel-heading"><h2>مستودع فهدان — أرصدة الأصناف</h2><span>{products.length} أصناف</span></div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',textAlign:'right'}}>
          <thead><tr><th>المنتج</th><th>الرصيد</th><th>المحجوز</th><th>المتاح</th><th>حد التنبيه</th><th>الوحدة</th></tr></thead>
          <tbody>{products.map(p=><tr key={p.id} style={{borderTop:'1px solid #d7d2c6'}}>
            <td style={{padding:'12px'}}>{p.name}</td><td>{n(p.onHand)}</td><td>{n(p.reserved)}</td>
            <td>{n(p.onHand-p.reserved)}</td><td>{n(p.reorderPoint)}</td><td>{p.unit==='GRAM'?'جرام':p.unit==='PIECE'?'قطعة':'مل'}</td>
          </tr>)}</tbody>
        </table>
        {!products.length&&<p>لا توجد منتجات فعلية مسجلة بعد.</p>}
      </div>
    </div>
    <div className="admin-panel" style={{marginTop:'1.5rem'}}>
      <div className="panel-heading">
        <h2><Images size={20}/> مكتبة صور المنتجات — Google Drive</h2>
        <span>{ready?'تم التفويض':'بانتظار الربط'}</span>
      </div>
      <p>اختر عدة صور للمنتج دفعة واحدة، وعاينها قبل الرفع. تُحفظ بالترتيب في Google Drive وتُعرض في معرض صور المنتج بعد نشره.</p>
      {folderUrl&&<p><a href={folderUrl} target="_blank" rel="noreferrer">فتح مجلد الصور الخاص بالتطبيق في Google Drive ↗</a></p>}
      <form onSubmit={submit} className="fahdan-multi-upload-form">
        <label>المنتج
          <select required value={selected} disabled={busy} onChange={e=>changeProduct(e.target.value)}>
            <option value="">اختر المنتج</option>
            {products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="fahdan-photo-capacity">
          <ImagePlus size={18}/> {product?<>الصور المحفوظة: <b>{product.imageCount} من {MAX_PRODUCT_PHOTOS}</b> — يمكن إضافة {remaining} صورة</>:'اختر المنتج لعرض عدد الصور المتاحة'}
        </div>
        <label className="fahdan-multi-upload-picker">
          <UploadCloud size={25}/>
          <strong>اختيار صور المنتج (يمكن اختيار أكثر من صورة)</strong>
          <span>JPG أو PNG أو WebP — حتى 6 ميجابايت للصورة — بحد أقصى 12 صورة للمنتج</span>
          <input type="file" multiple accept="image/jpeg,image/png,image/webp"
            disabled={!ready||!selected||busy||remaining===0||files.length>=remaining}
            onChange={onSelectFiles} aria-label="اختيار عدة صور للمنتج"/>
        </label>
        {!!files.length&&<div className="fahdan-upload-preview">
          <div className="fahdan-upload-preview-heading">
            <strong>الصور المحددة ({files.length})</strong>
            <button type="button" disabled={busy} onClick={()=>setFiles([])}>إلغاء تحديد الكل</button>
          </div>
          <div className="fahdan-upload-thumbnails">
            {files.map((file,index)=><div className="fahdan-upload-photo" key={fileKey(file)}>
              {previews[index]&&<img src={previews[index]} alt={`معاينة ${file.name}`}/>}
              <span title={file.name}>{file.name}</span>
              <small>{(file.size/1024/1024).toFixed(2)} MB</small>
              <button type="button" disabled={busy} aria-label={`إزالة ${file.name}`}
                onClick={()=>setFiles(prev=>prev.filter(item=>fileKey(item)!==fileKey(file)))}><Trash2 size={15}/></button>
            </div>)}
          </div>
        </div>}
        {progress&&<p className="fahdan-upload-progress" role="status">
          جارٍ معالجة الصورة {Math.min(progress.completed+1,progress.total)} من {progress.total}…
          <progress value={progress.completed} max={progress.total}/>
        </p>}
        <button className="button dark" type="submit" disabled={!ready||!selected||!files.length||busy}>
          <UploadCloud size={18}/>
          {busy?'جارٍ رفع الصور…':`رفع ${files.length||0} ${files.length===1?'صورة':'صور'} إلى Google Drive`}
        </button>
      </form>
      {message&&<p className="fahdan-upload-success" role="status"><CheckCircle2 size={17}/>{message}</p>}
      {error&&<p className="fahdan-upload-error" role="alert"><CircleAlert size={17}/>{error}</p>}
      {!products.length&&<small>يلزم إنشاء منتج فعلي أولًا قبل رفع صوره.</small>}
    </div>
  </>;
}
