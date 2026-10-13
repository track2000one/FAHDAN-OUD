import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileText, Printer, ShieldAlert } from 'lucide-react';
import { getCustomerOrderDocument, type OrderDocument } from '../api';

const money=(value:string)=>new Intl.NumberFormat('ar-SA',{
  style:'currency',currency:'SAR'
}).format(Number(value));
const date=(v:string)=>new Intl.DateTimeFormat('ar-SA',{dateStyle:'long',timeStyle:'short'}).format(new Date(v));
const SESSION='fahdan-customer-session';

export function CustomerOrderDocument(){
  const {id}=useParams();
  const [doc,setDoc]=useState<OrderDocument|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const token=sessionStorage.getItem(SESSION);
  useEffect(()=>{
    if(!token||!id){setLoading(false);return;}
    let active=true;setLoading(true);setError('');
    getCustomerOrderDocument(token,id).then(x=>{if(active)setDoc(x.document);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'تعذر تحميل المستند.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[token,id]);

  if(!token)return <main className="container fahdan-invoice-error">
    <ShieldAlert size={31}/><h1>يلزم تسجيل الدخول</h1>
    <p>هذا المستند خاص بصاحب الطلب.</p><Link to="/account/login">تسجيل الدخول</Link>
  </main>;
  if(loading)return <main className="container fahdan-invoice-error">جارٍ إعداد مستند الطلب…</main>;
  if(error||!doc)return <main className="container fahdan-invoice-error">
    <ShieldAlert size={31}/><h1>تعذر عرض المستند</h1><p>{error||'المستند غير متاح.'}</p>
    <Link to="/account">العودة إلى حسابي</Link>
  </main>;

  const receipt=doc.kind==='PURCHASE_RECEIPT';
  return <main className="container fahdan-invoice-page" dir="rtl">
    <div className="fahdan-invoice-actions">
      <Link to="/account">العودة إلى طلباتي</Link>
      <button type="button" onClick={()=>window.print()}><Printer size={17}/> طباعة / حفظ PDF</button>
    </div>
    <article className="fahdan-invoice-sheet">
      <header>
        <div><span className="section-kicker">FAHDAN OUD</span><h1>فهدان للعود</h1>
          <p>{receipt?'إيصال شراء (غير ضريبي)':'مستند طلب شراء مبدئي — غير مدفوع'}</p></div>
        <FileText size={40}/>
      </header>
      <div className="fahdan-invoice-disclaimer">
        <ShieldAlert size={18}/><span>{doc.notice}</span>
      </div>
      <div className="fahdan-invoice-metadata">
        <div><small>رقم الطلب المرجعي</small><strong dir="ltr">{doc.documentNumber}</strong></div>
        <div><small>تاريخ تسجيل الطلب</small><strong>{date(doc.createdAt)}</strong></div>
        <div><small>العميل</small><strong>{doc.customerName}</strong></div>
        <div><small>حالة المستند</small><strong>{receipt?'بيع مسجل بدفع مؤكد':'طلب قيد المراجعة / غير مدفوع'}</strong></div>
      </div>
      {doc.address&&<section className="fahdan-invoice-address">
        <h2>عنوان التوصيل وقت الطلب</h2>
        <p>{doc.address.recipientName} — {doc.address.phone}</p>
        <p>{doc.address.city}، {doc.address.district}، {doc.address.street}
          {doc.address.building?'، مبنى '+doc.address.building:''}</p>
      </section>}
      <h2>تفاصيل المنتجات</h2>
      <div className="fahdan-invoice-table-wrap"><table>
        <thead><tr><th>المنتج</th><th>الرمز</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>{doc.items.map(item=><tr key={item.id}>
          <td>{item.productNameAr}</td><td dir="ltr">{item.skuSnapshot}</td>
          <td>{item.quantityItems}</td><td>{money(item.unitPriceSar)}</td>
          <td>{money(item.totalPriceSar)}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="fahdan-invoice-totals">
        <div><span>مجموع المنتجات</span><strong>{money(doc.subtotalSar)}</strong></div>
        {Number(doc.discountSar)>0&&<div><span>الخصم</span><strong>-{money(doc.discountSar)}</strong></div>}
        <div><span>رسوم الشحن</span><strong>{receipt&&doc.shippingSar!==null?money(doc.shippingSar):'تُحدّد بعد المراجعة'}</strong></div>
        <div><span>الضريبة</span><strong>{receipt&&doc.taxSar!==null?money(doc.taxSar):'غير محددة بعد'}</strong></div>
        <div className="total"><span>{receipt?'إجمالي مبلغ الشراء المسجل':'الإجمالي النهائي'}</span>
          <strong>{receipt&&doc.totalSar?money(doc.totalSar):'لم يُعتمد بعد'}</strong></div>
      </div>
      <footer>
        <p>احتفظ بهذا المستند لمتابعة طلبك. لا تتضمن النسخة رقم فاتورة إلكترونية ضريبية أو رمز QR ضريبي، ولا تمثل فاتورة متوافقة مع نظام «فاتورة».</p>
        <p>للاستبدال والاسترجاع، راجع <Link to="/returns-policy">سياسة فهدان</Link>.</p>
      </footer>
    </article>
  </main>;
}
