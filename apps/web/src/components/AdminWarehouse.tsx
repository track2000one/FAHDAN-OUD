import { useEffect, useState, type FormEvent } from 'react';
import { getAdminProducts, getDriveStatus, uploadAdminProductImage, type AdminProduct } from '../api';

export function AdminWarehouse({token}:{token:string}) {
  const [products,setProducts] = useState<AdminProduct[]>([]);
  const [selected,setSelected] = useState('');
  const [file,setFile] = useState<File|null>(null);
  const [ready,setReady] = useState(false);
  const [folderUrl,setFolderUrl] = useState<string|null>(null);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getAdminProducts(token),getDriveStatus(token)]).then(results => {
      if (!active) return;
      const productsResult = results[0];
      const driveResult = results[1];
      if (productsResult.status === 'fulfilled') {
        setProducts(productsResult.value);
        setSelected(prev=>prev||productsResult.value[0]?.id||'');
      } else setMessage('تعذر تحميل المستودع.');
      if (driveResult.status === 'fulfilled') {
        setReady(driveResult.value.authorized);
        setFolderUrl(driveResult.value.folderUrl);
        if (!driveResult.value.authorized) setMessage('ربط صور Google Drive لم يُعتمد بعد.');
      } else setMessage('تعذر التحقق من صلاحية Google Drive. راجع التفويض.');
    });
    return () => {active = false;};
  },[token]);

  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || !selected) return;
    setBusy(true);setMessage('');
    try {
      await uploadAdminProductImage(token,selected,file);
      setMessage('تم حفظ الصورة في Google Drive وربطها بالصنف.');
      setFile(null);
      const control=document.getElementById('fahdan-upload') as HTMLInputElement|null;
      if(control)control.value='';
    } catch (err) {
      setMessage(err instanceof Error?err.message:'فشل رفع الصورة.');
    } finally {setBusy(false);}
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
      <div className="panel-heading"><h2>مكتبة صور المنتجات — Google Drive</h2><span>{ready?'تم التفويض':'بانتظار الربط'}</span></div>
      <p>تُحفظ الصور على Drive بصلاحية محدودة وتُعرض صور المنتجات المنشورة عبر خادم فهدان.</p>
      {folderUrl&&<p><a href={folderUrl} target="_blank" rel="noreferrer">فتح مجلد الصور الخاص بالتطبيق في Google Drive ↗</a></p>}
      <form onSubmit={submit} style={{display:'grid',gap:'12px',maxWidth:'580px'}}>
        <label>المنتج
          <select required value={selected} onChange={e=>setSelected(e.target.value)}>
            <option value="">اختر المنتج</option>
            {products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>صورة JPG أو PNG أو WebP (حتى 6MB)
          <input id="fahdan-upload" type="file" accept="image/jpeg,image/png,image/webp"
            onChange={e=>setFile(e.target.files?.[0]||null)}/>
        </label>
        <button className="button dark" disabled={!ready||!selected||!file||busy}>
          {busy?'جارٍ رفع الصورة…':'رفع الصورة إلى Google Drive'}
        </button>
      </form>
      {message&&<p role="status">{message}</p>}
      {!products.length&&<small>يلزم إنشاء منتج فعلي أولًا قبل رفع صورته.</small>}
    </div>
  </>;
}
