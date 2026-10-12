import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, PackagePlus, RefreshCw, ShieldCheck, TrendingDown } from 'lucide-react';
import {
  getAdminProductStock, receiveAdminStock, writeOffAdminStock,
  type AdminStockSnapshot, type AdminReviewProduct
} from '../api';

const unit:Record<string,string>={GRAM:'جم',MILLILITER:'مل',PIECE:'قطعة'};
const kindNames:Record<string,string>={
  PURCHASE_RECEIPT:'استلام شراء',SALE_SHIPPED:'شحن طلب',SAMPLE:'عينة',
  MARKETING:'تسويق',RETURN_RESTOCK:'إعادة مخزون',DAMAGE:'تلف',
  LOSS:'فقد',ADJUSTMENT:'تصحيح نقص جرد'
};
const date=(v:string)=>new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
const emptyReceipt=()=>({
  quantityBase:'',totalCostSar:'',supplierName:'',invoiceReference:'',
  receivedAt:new Date().toISOString().slice(0,10)
});
const emptyWriteOff=()=>({
  quantityBase:'',kind:'DAMAGE' as 'DAMAGE'|'LOSS'|'ADJUSTMENT',reason:''
});

export function AdminStockOperations({token,product,onUpdated}:{
  token:string;product:AdminReviewProduct;onUpdated:()=>void;
}) {
  const [stock,setStock]=useState<AdminStockSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [mode,setMode]=useState<'receipt'|'writeoff'>('receipt');
  const [receipt,setReceipt]=useState(emptyReceipt);
  const [writeoff,setWriteoff]=useState(emptyWriteOff);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const receiptKey=useRef(crypto.randomUUID());
  const writeoffKey=useRef(crypto.randomUUID());
  const sizeUnit=unit[product.baseUnit]||product.baseUnit;

  useEffect(()=>{
    let live=true;setLoading(true);setError('');setMessage('');
    setReceipt({...emptyReceipt(),supplierName:product.purchase?.supplierName||''});
    setWriteoff(emptyWriteOff());receiptKey.current=crypto.randomUUID();writeoffKey.current=crypto.randomUUID();
    getAdminProductStock(token,product.id).then(data=>{if(live)setStock(data);})
      .catch(err=>{if(live)setError(err instanceof Error?err.message:'تعذر تحميل حركات المخزون.');})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[token,product.id]);

  async function refresh(){
    setError('');setMessage('');setLoading(true);
    try{setStock(await getAdminProductStock(token,product.id));}
    catch(err){setError(err instanceof Error?err.message:'تعذر تحديث بيانات المخزون.');}
    finally{setLoading(false);}
  }
  function updateReceipt<K extends keyof ReturnType<typeof emptyReceipt>>(key:K,val:string){
    setReceipt(previous=>({...previous,[key]:val}));
    receiptKey.current=crypto.randomUUID();
  }
  function updateWriteoff<K extends keyof ReturnType<typeof emptyWriteOff>>(key:K,val:ReturnType<typeof emptyWriteOff>[K]){
    setWriteoff(previous=>({...previous,[key]:val}));
    writeoffKey.current=crypto.randomUUID();
  }
  async function submitReceipt(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;
    if(!window.confirm('تأكيد استلام دفعة شراء جديدة وتسجيل تكلفتها ومضاعفة الرصيد بالكمية المدخلة؟'))return;
    setBusy(true);setError('');setMessage('');
    try{
      const result=await receiveAdminStock(token,product.id,{...receipt,requestKey:receiptKey.current});
      setStock(result);setMessage(result.message);
      receiptKey.current=crypto.randomUUID();
      setReceipt({...emptyReceipt(),supplierName:receipt.supplierName});
      onUpdated();
    }catch(err){setError(err instanceof Error?err.message:'تعذر تسجيل الدفعة. لا تعِد العملية دون التحقق من حركات المخزون.');}
    finally{setBusy(false);}
  }
  async function submitWriteOff(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;
    if(!window.confirm('سيُخصم الرصيد نهائيًا من المخزون المتاح وتوثَّق حركة النقص. هل أنت متأكد؟'))return;
    setBusy(true);setError('');setMessage('');
    try{
      const result=await writeOffAdminStock(token,product.id,{...writeoff,requestKey:writeoffKey.current});
      setStock(result);setMessage(result.message);writeoffKey.current=crypto.randomUUID();
      setWriteoff(emptyWriteOff());onUpdated();
    }catch(err){setError(err instanceof Error?err.message:'تعذر تسجيل حركة النقص.');}
    finally{setBusy(false);}
  }

  return <section className="fahdan-stock-manager">
    <div className="fahdan-stock-manager-heading">
      <h4><ClipboardList size={19}/> إدارة مخزون المنتج وحركاته</h4>
      <button type="button" disabled={busy||loading} onClick={refresh}><RefreshCw size={15}/> تحديث</button>
    </div>
    <p>زيادة الرصيد تتم باستلام شراء موثق مع التكلفة والمورد، وخفضه يتم بتسجيل تلف أو فقد أو فرق جرد بسبب واضح. لا يُعدّل رصيد الدفعات مباشرة.</p>
    {error&&<p className="fahdan-stock-message error" role="alert"><AlertTriangle size={16}/>{error}</p>}
    {message&&<p className="fahdan-stock-message success" role="status"><CheckCircle2 size={16}/>{message}</p>}
    <div className="fahdan-stock-summary">
      <div><small>الرصيد الفعلي</small><strong>{stock?.balance?.onHandBase??product.onHandBase} {sizeUnit}</strong></div>
      <div><small>المحجوز للطلبات</small><strong>{stock?.balance?.reservedBase||'0'} {sizeUnit}</strong></div>
      <div><small>المتاح للصرف</small><strong>{stock?.balance?.availableBase??product.availableBase} {sizeUnit}</strong></div>
    </div>
    <div className="fahdan-stock-switch">
      <button type="button" className={mode==='receipt'?'active':''} onClick={()=>setMode('receipt')}>
        <PackagePlus size={16}/> استلام شراء جديد
      </button>
      <button type="button" className={mode==='writeoff'?'active':''} onClick={()=>setMode('writeoff')}>
        <TrendingDown size={16}/> تسجيل نقص أو تلف
      </button>
    </div>
    {mode==='receipt'?<form onSubmit={submitReceipt} className="fahdan-stock-form">
      <label>الكمية المستلمة ({sizeUnit}) *
        <input type="number" required min={product.baseUnit==='PIECE'?'1':'0.001'}
          step={product.baseUnit==='PIECE'?'1':'0.001'}
          value={receipt.quantityBase} disabled={busy} onChange={e=>updateReceipt('quantityBase',e.target.value)}/></label>
      <label>إجمالي تكلفة الدفعة (ر.س) *
        <input type="number" required min="0.01" step="0.01" value={receipt.totalCostSar}
          disabled={busy} onChange={e=>updateReceipt('totalCostSar',e.target.value)}/></label>
      <label>المورد *
        <input required minLength={2} maxLength={160} value={receipt.supplierName}
          disabled={busy} onChange={e=>updateReceipt('supplierName',e.target.value)}/></label>
      <label>تاريخ الاستلام *
        <input required type="date" value={receipt.receivedAt} disabled={busy}
          onChange={e=>updateReceipt('receivedAt',e.target.value)}/></label>
      <label className="full">مرجع الفاتورة أو مستند الاستلام
        <input maxLength={100} value={receipt.invoiceReference} disabled={busy}
          onChange={e=>updateReceipt('invoiceReference',e.target.value)}/></label>
      <div className="fahdan-stock-form-footer">
        <ShieldCheck size={16}/> عملية الاستلام تُنشئ شراءً ودفعة تكلفة وحركة رصيد قابلة للتتبع.
        <button type="submit" disabled={busy}>{busy?'جارٍ الحفظ…':'تأكيد استلام الدفعة'}</button>
      </div>
    </form>:<form onSubmit={submitWriteOff} className="fahdan-stock-form">
      <label>الكمية المراد خصمها ({sizeUnit}) *
        <input type="number" required min={product.baseUnit==='PIECE'?'1':'0.001'}
          step={product.baseUnit==='PIECE'?'1':'0.001'}
          value={writeoff.quantityBase} disabled={busy} onChange={e=>updateWriteoff('quantityBase',e.target.value)}/></label>
      <label>نوع الحركة *
        <select value={writeoff.kind} disabled={busy}
          onChange={e=>updateWriteoff('kind',e.target.value as 'LOSS'|'DAMAGE'|'ADJUSTMENT')}>
          <option value="DAMAGE">تلف</option><option value="LOSS">فقد</option>
          <option value="ADJUSTMENT">تصحيح نقص جرد</option>
        </select></label>
      <label className="full">سبب النقص أو محضر الجرد * (8 أحرف على الأقل)
        <textarea required minLength={8} maxLength={400} rows={2} value={writeoff.reason}
          disabled={busy} onChange={e=>updateWriteoff('reason',e.target.value)}/></label>
      <div className="fahdan-stock-form-footer">
        <ShieldCheck size={16}/> لا يُسمح بخصم كمية تتجاوز الرصيد المتاح بعد استبعاد الحجوزات.
        <button type="submit" disabled={busy}>{busy?'جارٍ التسجيل…':'تأكيد حركة النقص'}</button>
      </div>
    </form>}
    <div className="fahdan-stock-history">
      <h5>آخر حركات المخزون</h5>
      {loading?<p>جارٍ تحميل السجل…</p>:!stock?.movements.length?<p>لا توجد حركات مخزون مسجلة.</p>:
        <div className="fahdan-stock-table-wrap"><table>
          <thead><tr><th>الحركة</th><th>التغير</th><th>التاريخ</th><th>السبب</th></tr></thead>
          <tbody>{stock.movements.map(item=><tr key={item.id}>
            <td>{kindNames[item.kind]||item.kind}</td>
            <td dir="ltr">{Number(item.deltaBase)>0?'+':''}{item.deltaBase} {sizeUnit}</td>
            <td>{date(item.createdAt)}</td><td>{item.reason||'—'}</td>
          </tr>)}</tbody>
        </table></div>}
    </div>
  </section>;
}
