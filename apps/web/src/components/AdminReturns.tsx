import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react';
import { getAdminReturns, reviewAdminReturn, type AdminReturnRecord, type ReturnStatus } from '../api';

const statuses:Record<string,string>={
  SUBMITTED:'بانتظار مراجعة المتجر',NEEDS_INFORMATION:'طلب معلومات إضافية من العميل',
  APPROVED:'تمت الموافقة',REJECTED:'مرفوض مع توضيح السبب',
  ITEM_RECEIVED:'تم استلام المرتجع'
};
const reasons:Record<string,string>={
  CHANGED_MIND:'عدول عن الشراء',DAMAGED:'وصول المنتج تالفًا',
  DEFECTIVE:'عيب في المنتج',WRONG_ITEM:'منتج مختلف',
  NOT_AS_DESCRIBED:'عدم مطابقة الوصف',OTHER:'سبب آخر'
};
const date=(v:string)=>new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium'}).format(new Date(v));

export function AdminReturns({token}:{token:string}){
  const [records,setRecords]=useState<AdminReturnRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [choices,setChoices]=useState<Record<string,Exclude<ReturnStatus,'SUBMITTED'>>>({});
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    getAdminReturns(token).then(x=>{if(active)setRecords(x.requests);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'تعذر تحميل طلبات الاسترجاع.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[token,refresh]);
  const pending=useMemo(()=>records.filter(r=>['SUBMITTED','NEEDS_INFORMATION','APPROVED'].includes(r.status)).length,[records]);

  async function submit(record:AdminReturnRecord){
    const status=choices[record.id]||(record.status==='APPROVED'?'ITEM_RECEIVED':'NEEDS_INFORMATION');
    const note=(notes[record.id]||'').trim();
    if(note.length<10){setError('يلزم توضيح سبب القرار أو ملاحظات الفحص بما لا يقل عن 10 أحرف.');return;}
    if(!window.confirm('تأكيد تغيير حالة طلب الاسترجاع وتوثيق القرار في سجل الإدارة؟'))return;
    setBusy(record.id);setError('');setNotice('');
    try{
      const result=await reviewAdminReturn(token,record.id,status,note);
      setNotice(result.message);setRefresh(x=>x+1);
    }catch(e){setError(e instanceof Error?e.message:'تعذر حفظ القرار.');}
    finally{setBusy('');}
  }

  return <section className="admin-panel fahdan-admin-returns" id="fahdan-admin-returns">
    <div className="panel-heading"><h2><RotateCcw size={20}/> طلبات الاستبدال والاسترجاع</h2>
      <button type="button" onClick={()=>setRefresh(x=>x+1)} disabled={loading||!!busy}>
        <RefreshCw size={16}/> تحديث
      </button></div>
    <p className="fahdan-returns-note">طلبات بانتظار الإجراء: {pending} — لا يتم رد الأموال أو إعادة المنتجات إلى المخزون تلقائيًا. تتم مراجعة الفحص والحقوق النظامية قبل اتخاذ القرار.</p>
    {error&&<p className="fahdan-stock-message error" role="alert"><ShieldAlert size={16}/>{error}</p>}
    {notice&&<p className="fahdan-stock-message success" role="status"><ClipboardCheck size={16}/>{notice}</p>}
    {loading?<p>جارٍ تحميل طلبات الاسترجاع…</p>:!records.length?
      <p className="fahdan-returns-note">لا توجد طلبات استرجاع أو استبدال مقدمة حتى الآن.</p>:
      <div className="fahdan-admin-return-list">{records.map(r=>{
        const options:Exclude<ReturnStatus,'SUBMITTED'>[]=r.status==='APPROVED'?['ITEM_RECEIVED']:
          ['SUBMITTED','NEEDS_INFORMATION'].includes(r.status)?
          ['NEEDS_INFORMATION','APPROVED','REJECTED']:
          [];
        return <article className="fahdan-admin-return-card" key={r.id}>
          <div className="fahdan-admin-return-heading">
            <div><strong>{r.orderItem.productNameAr} — {r.quantity} قطعة</strong>
              <small>طلب #{r.order.orderNumber} — {r.customer.name} ({r.customer.email}) — {date(r.createdAt)}</small></div>
            <span>{statuses[r.status]||r.status}</span>
          </div>
          <p><b>{r.kind==='EXCHANGE'?'استبدال':'استرجاع'} — {reasons[r.reason]||r.reason}</b></p>
          <p>{r.explanation}</p>
          <p><b>تم فتح العبوة / استخدامها:</b> {r.itemOpened?'نعم':'لا'}</p>
          {r.decisionNote&&<p className="fahdan-return-decision">ملاحظة المتجر السابقة: {r.decisionNote}</p>}
          {options.length>0&&<div className="fahdan-admin-return-actions">
            <label>قرار المدير
              <select value={choices[r.id]||(r.status==='APPROVED'?'ITEM_RECEIVED':'NEEDS_INFORMATION')}
                disabled={!!busy} onChange={e=>setChoices(x=>({...x,[r.id]:e.target.value as Exclude<ReturnStatus,'SUBMITTED'>}))}>
                {options.map(o=><option key={o} value={o}>{statuses[o]}</option>)}
              </select>
            </label>
            <label>ملاحظات المراجعة / التسبيب
              <textarea rows={2} minLength={10} maxLength={1200} value={notes[r.id]||''}
                onChange={e=>setNotes(x=>({...x,[r.id]:e.target.value}))} disabled={!!busy}
                placeholder="وضح نتيجة المراجعة أو سبب طلب المعلومات أو الرفض…"/></label>
            <button className="button dark" type="button" disabled={!!busy||!(notes[r.id]?.trim().length>=10)}
              onClick={()=>submit(r)}>{busy===r.id?'جارٍ الحفظ…':'حفظ قرار المراجعة'}</button>
          </div>}
          {r.status==='ITEM_RECEIVED'&&<p className="fahdan-returns-note">تم تسجيل استلام المرتجع، لكن حالة رد المبلغ والاستبدال لا تتغير تلقائيًا. تُستكمل الإجراءات المالية بعد تفعيل الدفع وإعداد الفوترة المعتمدة.</p>}
        </article>;
      })}</div>}
  </section>;
}
