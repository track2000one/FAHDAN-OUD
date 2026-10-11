const escape = (s: string) => s.replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]!));

export function emailEnabled(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim() && process.env.BREVO_SENDER_EMAIL?.trim() && process.env.WEB_ORIGIN);
}

export type MailPurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';
export async function sendCustomerMail(address: string, name: string, purpose: MailPurpose, token: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'فهدان للعود';
  const origin = process.env.WEB_ORIGIN;
  if (!apiKey || !senderEmail || !origin || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail))
    throw new Error('EMAIL_NOT_CONFIGURED');
  const url = new URL(purpose === 'VERIFY_EMAIL' ? '/account/verify' : '/account/reset-password', origin);
  url.searchParams.set('token',token);
  const verification = purpose === 'VERIFY_EMAIL';
  const subject = verification ? 'تأكيد بريدك الإلكتروني | فهدان للعود' : 'استعادة كلمة المرور | فهدان للعود';
  const intro = verification ? 'يرجى تأكيد عنوان بريدك الإلكتروني لتفعيل حسابك في فهدان.' :
    'تلقينا طلبًا لإعادة تعيين كلمة مرور حسابك في فهدان.';
  const button = verification ? 'تأكيد البريد الإلكتروني' : 'إعادة تعيين كلمة المرور';
  const expires = verification ? '24 ساعة' : '30 دقيقة';
  const greeting = `مرحبًا ${name || 'بك'}،`;
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
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:'POST',
    headers: {
      'api-key': apiKey,
      'accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{email: address, name: name || undefined}],
      subject,
      htmlContent: html
    }),
    signal: AbortSignal.timeout(16000)
  });
  if (!response.ok) {
    // Do not log raw provider response; it might contain confidential details.
    console.error('Transactional email provider returned HTTP',response.status);
    throw new Error('EMAIL_DELIVERY_FAILED');
  }
}
