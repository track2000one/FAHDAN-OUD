import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardList, RotateCcw, ShieldAlert, Send, ShoppingBag } from 'lucide-react';
import {
  createCustomerReturn, getCustomerReturns, replyCustomerReturn,
  type CustomerOrder, type ReturnKind, type ReturnReason, type ReturnRequestRecord
} from '../api';

const reasons:{id:ReturnReason;label:string}[]=[
  {id:'CHANGED_MIND',label:'عدول عن الشراء — المنتج غير مستخدم'},
  {id:'DAMAGED',label:'المنتج وصل تالفًا'},
  {id:'DEFECTIVE',label:'عيب في المنتج'},
  {id:'WRONG_ITEM',label:'وصل منتج مختلف عن الطلب'},
  {id:'NOT_AS_DESCRIBED',label:'المنتج غير مطابق للوصف'},
  {id:'OTHER',label:'سبب آخر يحتاج مراجعة'}
];
export const returnStatus:Record<string,string>={
  SUBMITTED:'بانتظار مراجعة المتجر',NEEDS_INFORMATION:'بانتظار معلومات من العميل',
  APPROVED:'تمت الموافقة على الطلب',REJECTED:'تم رفض الطلب مع التوضيح',
  ITEM_RECEIVED:'تم استلام المرتجع للفحص والمتابعة'
};
const date=(v:string)=>new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium'}).format(new Date(v));

export function CustomerReturns({token,orders}:{token:string;orders:CustomerOrder[]}){
  const [records,setRecords]=useState<ReturnRequestRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [itemId,setItemId]=useState('');
  const [quantity,setQuantity]=useState(1);
  const [kind,setKind]=useState<ReturnKind>('RETURN');
  const [reason,setReason]=useState<ReturnReason>('CHANGED_MIND');
  const [opened,setOpened]=useState(false);
  const [description,setDescription]=useState('');
  const [replyId,setReplyId]=useState('');
  const [reply,setReply]=useState('');

  const eligible=orders.filter(o=>o.state==='DELIVERED'||
    o.shipments.some(s=>s.state==='DELIVERED'));
  const availableItems=eligible.flatMap(order=>order.items.map(item=>({
    id:item.id,name:item.productNameAr,quantity:item.quantityItems,
    orderNumber:order.orderNumber
  })));
  const selected=availableItems.find(item=>item.id===itemId);
  const already=records.filter(r=>r.orderItemId===itemId&&r.status!=='REJECTED')
    .reduce((sum,r)=>sum+r.quantity,0);
  const available=Math.max(0,(selected?.quantity||0)-already);

  async function reload(){
    try{setRecords((await getCustomerReturns(token)).requests);}
    catch(e){setError(e instanceof Error?e.message:'تعذر تحميل طلبات الاسترجاع.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{
    let live=true;
    getCustomerReturns(token).then(data=>{if(live)setRecords(data.requests);})
      .catch(e=>{if(live)setError(e instanceof Error?e.message:'تعذر تحميل الاسترجاعات.');})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false};
  },[token]);
  useEffect(()=>{
    if(!itemId&&availableItems.length)setItemId(availableItems[0].id);
  },[itemId,orders]);

  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!itemId||!available||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await createCustomerReturn(token,{
        orderItemId:itemId,quantity:Math.min(quantity,available),
        kind,reason,explanation:description,itemOpened:opened
      });
      setNotice(result.message);
      setDescription('');setQuantity(1);setOpened(false);
      await reload();
    }catch(e){setError(e instanceof Error?e.message:'تعذر إرسال الطلب.');}
    finally{setBusy(false);}
  }
  async function sendReply(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!replyId||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const r=await replyCustomerReturn(token,replyId,reply);
      setNotice(r.message);setReplyId('');setReply('');await reload();
    }catch(e){setError(e instanceof Error?e.message:'تعذر إرسال المعلومات.');}
    finally{setBusy(false);}
  }
  return <div className="fahdan-returns-customer">
    <div className="account-section-title"><div><span className="section-kicker">خدمة ما بعد البيع</span>
      <h2>الاستبدال والاسترجاع</h2></div><RotateCcw size={24}/></div>
    <p className="fahdan-returns-help">يمكن تقديم طلب مراجعة الاسترجاع أو الاستبدال بعد استلام الشحنة. حق العدول الاعتيادي خلال 7 أيام من التسلم للمنتج غير المستخدم، مع مراعاة الاستثناءات النظامية، ولا تسقط حقوق العيب وعدم المطابقة لمجرد انتهاء هذه المدة. <Link to="/returns-policy">اقرأ السياسة كاملة</Link></p>
    {error&&<p className="account-alert error" role="alert"><ShieldAlert size={17}/>{error}</p>}
    {notice&&<p className="account-alert success" role="status"><CheckCircle2 size={17}/>{notice}</p>}
    <section className="fahdan-returns-section">
      <h3><ShoppingBag size={19}/> تقديم طلب جديد</h3>
      {!availableItems.length?<p className="fahdan-returns-note">لا توجد شحنة موثَّق استلامها في حسابك حاليًا. إذا أردت إلغاء طلب قبل التسليم، تواصل مع خدمة المتجر.</p>:
      <form className="fahdan-returns-form" onSubmit={submit}>
        <label className="full">المنتج من مشترياتك
          <select value={itemId} required onChange={e=>{setItemId(e.target.value);setQuantity(1);}}>
            {availableItems.map(item=><option key={item.id} value={item.id}>
              {item.name} — الطلب #{item.orderNumber} (المشترى: {item.quantity})
            </option>)}
          </select></label>
        <label>نوع الطلب<select value={kind} onChange={e=>setKind(e.target.value as ReturnKind)}>
          <option value="RETURN">استرجاع المنتج</option><option value="EXCHANGE">استبدال المنتج</option>
        </select></label>
        <label>عدد القطع المطلوب استرجاعها<input type="number" min="1" max={available||1} required
          value={quantity} onChange={e=>setQuantity(Number(e.target.value))} disabled={!available}/></label>
        <label className="full">سبب الطلب<select value={reason} onChange={e=>setReason(e.target.value as ReturnReason)}>
          {reasons.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
        </select></label>
        <label className="full">شرح الحالة (15 حرفًا على الأقل)
          <textarea rows={3} minLength={15} maxLength={1400} required value={description}
            onChange={e=>setDescription(e.target.value)} placeholder="اشرح الحالة والمنتج المطلوب استرجاعه…"/></label>
        <label className="fahdan-returns-check full"><input type="checkbox" checked={opened}
          onChange={e=>setOpened(e.target.checked)}/> تم فتح العبوة أو استخدام المنتج</label>
        <p className="fahdan-returns-note full">الكمية المتبقية للتقديم: {available}. الطلب يخضع للمراجعة والفحص، ولا يُرد المبلغ أو يُحجز منتج بديل تلقائيًا.</p>
        <button className="button dark" type="submit" disabled={busy||!available||!Number.isInteger(quantity)||quantity<1||quantity>available}>
          <Send size={16}/>{busy?'جارٍ الإرسال…':'إرسال الطلب للمراجعة'}</button>
      </form>}
    </section>
    <section className="fahdan-returns-section">
      <h3><ClipboardList size={19}/> طلبات الاسترجاع السابقة</h3>
      {loading?<p>جارٍ تحميل الطلبات…</p>:records.length?records.map(r=>
        <article className="fahdan-return-record" key={r.id}>
          <div><strong>{r.orderItem.productNameAr}</strong>
            <span>{r.kind==='RETURN'?'استرجاع':'استبدال'} — {r.quantity} قطعة — {date(r.createdAt)}</span>
          </div>
          <span className="fahdan-return-state">{returnStatus[r.status]||r.status}</span>
          <p>{r.explanation}</p>
          {r.decisionNote&&<p className="fahdan-return-decision"><b>رد المتجر:</b> {r.decisionNote}</p>}
          {r.status==='NEEDS_INFORMATION'&&<form className="fahdan-return-reply" onSubmit={sendReply}>
            <textarea required minLength={15} maxLength={1400} rows={2}
              placeholder="أرسل المعلومات الإضافية التي طلبها المتجر…"
              value={replyId===r.id?reply:''}
              onChange={e=>{setReplyId(r.id);setReply(e.target.value)}}/>
            <button type="submit" disabled={busy||replyId!==r.id||reply.length<15}>إرسال المعلومات</button>
          </form>}
        </article>):<p className="fahdan-returns-note">لم تقدّم أي طلب استبدال أو استرجاع حتى الآن.</p>}
    </section>
  </div>;
}
