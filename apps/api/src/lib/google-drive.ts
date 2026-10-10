import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const TOKEN = 'https://oauth2.googleapis.com/token';
const FOLDER_KEY = 'drive.productImagesFolderId';
const MAX = 6 * 1024 * 1024;
let cache: { token: string; expires: number } | null = null;

export const driveConfigured = () => Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID &&
  process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN);

async function accessToken(): Promise<string> {
  if (!driveConfigured()) throw new Error('Google Drive OAuth variables are missing.');
  if (cache && Date.now() < cache.expires - 60000) return cache.token;
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
    refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN!,
    grant_type: 'refresh_token'
  });
  const response = await fetch(TOKEN, { method: 'POST', body, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('تعذر تجديد تفويض Google Drive. راجع حساب OAuth أو صلاحية Refresh Token.');
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('لم يصدر Google تصريح وصول.');
  cache = { token: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cache.token;
}

async function checkFolder(id: string, token: string): Promise<boolean> {
  const res = await fetch(`${API}/${encodeURIComponent(id)}?fields=id,mimeType`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000)
  });
  if (res.status === 403 || res.status === 404) return false;
  if (!res.ok) throw new Error('تعذر فحص مجلد الصور في Google Drive.');
  const folder = await res.json() as { mimeType?: string };
  return folder.mimeType === 'application/vnd.google-apps.folder';
}

async function ensureFolder(token: string): Promise<string> {
  const saved = await prisma.siteSetting.findUnique({ where: { key: FOLDER_KEY } });
  const savedId = saved?.value && typeof saved.value === 'object' && !Array.isArray(saved.value) &&
    'id' in saved.value && typeof saved.value.id === 'string' ? saved.value.id : null;
  if (savedId && await checkFolder(savedId, token)) return savedId;
  const configuredId = process.env.GOOGLE_DRIVE_PRODUCT_IMAGES_FOLDER_ID;
  // drive.file cannot automatically access a folder created by another OAuth app.
  if (configuredId && await checkFolder(configuredId, token)) {
    await prisma.siteSetting.upsert({ where: { key: FOLDER_KEY },
      create: { key: FOLDER_KEY, value: { id: configuredId } },
      update: { value: { id: configuredId } } });
    return configuredId;
  }
  // Create a dedicated app-owned folder with the restricted drive.file scope.
  const res = await fetch(`${API}?fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'FAHDAN-OUD-PRODUCT-IMAGES', mimeType: 'application/vnd.google-apps.folder' }),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error('تعذر إنشاء مجلد صور فهدان. راجع نطاق صلاحية drive.file.');
  const folder = await res.json() as { id?: string };
  if (!folder.id) throw new Error('لم يعِد Google معرّف مجلد الصور.');
  await prisma.siteSetting.upsert({ where: { key: FOLDER_KEY },
    create: { key: FOLDER_KEY, value: { id: folder.id } },
    update: { value: { id: folder.id } } });
  return folder.id;
}

export function isImage(bytes: Buffer, mime: string): boolean {
  if (bytes.length === 0 || bytes.length > MAX) return false;
  return mime === 'image/jpeg' ? bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === 'image/png' ? bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mime === 'image/webp' ? bytes.length >= 12 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP'
    : false;
}

export async function driveStatus(): Promise<{ configured: boolean; authorized: boolean; folderUrl: string | null }> {
  if (!driveConfigured()) return { configured: false, authorized: false, folderUrl: null };
  const token = await accessToken();
  const folderId = await ensureFolder(token);
  return { configured: true, authorized: true, folderUrl: `https://drive.google.com/drive/folders/${folderId}` };
}

export async function uploadImage(bytes: Buffer, mime: string): Promise<string> {
  if (!isImage(bytes,mime)) throw new Error('صيغة الصورة أو حجمها غير مدعوم.');
  const token = await accessToken();
  const folderId = await ensureFolder(token);
  const boundary = 'fahdan-' + randomUUID();
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const metadata = JSON.stringify({ name: `product-${randomUUID()}.${ext}`, parents: [folderId], mimeType: mime });
  const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const res = await fetch(`${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(multipart), signal: AbortSignal.timeout(40000)
  });
  if (!res.ok) throw new Error('لم ينجح رفع الصورة إلى Google Drive.');
  const json = await res.json() as { id?: string };
  if (!json.id) throw new Error('لم يُرجع Google معرّف الصورة.');
  return json.id;
}

export async function readImage(fileId: string): Promise<{ bytes: Buffer; mime: string }> {
  const token = await accessToken();
  const res = await fetch(`${API}/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000)
  });
  if (!res.ok) throw new Error('تعذر قراءة صورة المنتج.');
  const mime = (res.headers.get('content-type') || '').split(';')[0];
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!isImage(bytes, mime)) throw new Error('ملف الصورة غير صالح.');
  return { bytes, mime };
}

export async function deleteImage(fileId: string): Promise<void> {
  const token = await accessToken();
  const res = await fetch(`${API}/${encodeURIComponent(fileId)}`, {
    method:'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000)
  });
  if (!res.ok && res.status !== 404) throw new Error('تعذر تنظيف ملف الصورة من Google Drive.');
}
