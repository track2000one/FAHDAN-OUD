import type { Dashboard, Product } from './types';
import { demoProducts, fallbackCategories } from './demo';
const base = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const endpoint = (path:string) => `${base}/api/v1${path}`;

async function request<T>(path:string, options?:RequestInit):Promise<T> {
  const response = await fetch(endpoint(path), { ...options, headers:{ 'Content-Type':'application/json', ...options?.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body as T;
}
export async function getCatalog(): Promise<{ products:Product[]; categories:{slug:string;nameAr:string}[]; connected:boolean }> {
  try {
    const [products,categories] = await Promise.all([
      request<Product[]>('/products'), request<{slug:string;nameAr:string}[]>('/categories')
    ]);
    return {products,categories,connected:true};
  } catch {
    return {products:demoProducts,categories:fallbackCategories,connected:false};
  }
}
export function signIn(email:string,password:string) {
  return request<{ token:string; user:{name:string;role:string} }>('/auth/login',{
    method:'POST',body:JSON.stringify({email,password})
  });
}
export function getDashboard(token:string) {
  return request<Dashboard>('/admin/dashboard',{headers:{Authorization:`Bearer ${token}`}});
}
