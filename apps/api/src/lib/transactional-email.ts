import { randomUUID } from 'node:crypto';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]!));

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM && process.env.WEB_ORIGIN);
}

export type MailPurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';
export async function sendCustomerMail(address: string, name: string, purpose: MailPurpose, token: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  const origin = process.env.WEB_ORIGIN;
  if (!apiKey || !from || !origin) throw new Error('EMAIL_NOT_CONFIGURED');
  const url = new URL(purpose === 'VERIFY_EMAIL' ? '/account/verify' : '/account/reset-password', origin);
  url.searchParams.set('token',token);
  const verification = purpose === 'VERIFY_EMAIL';
  const subject = verification ? 'تأكيد بريدك الإلكتروني | فهدان للعود' : 'استعادة كلمة المرور | فهدان للعود';
  const intro = verification ? 'يرجى تأكيد عنوان بريدك الإلكتروني لتفعيل حسابك في فهدان.' :
    'تلقينا طلبًا لإعادة تعيين كلمة مرور حسابك في فهدان.';
  const button = verification ? 'تأكيد البريد الإلكتروني' : 'إعادة تعيين كلمة المرور';
  const expires = verification ? '24 ساعة' : '30 دقيقة';
  const greeting = `مرحبًا ${name || 'بك'}،`;
  const text = `${greeting}\n\n${intro}\n\n${button}: ${url.toString()}\n\nتنتهي صلاحية هذا الرابط بعد ${expires} ويُستخدم مرة واحدة.\nإذا لم تطلب ذلك فتجاهل هذه الرسالة.\nفهدان للعود`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head>
  <body style="background:#f7f4ee;font-family:Tahoma,Arial,sans-serif;padding:28px;color:#172721;">
  <div style="background:#fff;max-width:560px;margin:auto;border:1px solid #e8e1d3;border-radius:18px;padding:32px;">
  <h1 style="font-size:27px;color:#172721;margin:0 0 14px">فهدان للعود</h1>
  <p style="color:#ba9764;font-weight:bold">FAHDAN OUD</p>
  <p>${escape(greeting)}</p><p>${escape(intro)}</p>
  <p style="margin:34px 0"><a href="${escape(url.toString())}" style="color:white;background:#172721;text-decoration:none;padding:14px 25px;border-radius:8px;">${button}</a></p>
  <p style="font-size:13px">صلاحية الرابط: ${expires}، ويُستخدم مرة واحدة.</p>
  <p style="font-size:13px;color:#6d6f69">إذا لم تطلب هذه العملية، يمكنك تجاهل الرسالة.</p>
  </div></body></html>`;
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Fahdan-Oud/1.0',
      'Idempotency-Key': randomUUID()
    },
    body: JSON.stringify({from, to:[address], subject, text, html}),
    signal: AbortSignal.timeout(16000)
  });
  if (!response.ok) {
    // Do not log raw provider response; it might contain confidential details.
    console.error('Transactional email provider returned HTTP',response.status);
    throw new Error('EMAIL_DELIVERY_FAILED');
  }
}
