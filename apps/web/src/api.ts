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

export type AdminProduct = {id:string;name:string;status:string;unit:string;onHand:number;reserved:number;reorderPoint:number;variantCount:number};
export function getAdminProducts(token:string) {
  return request<AdminProduct[]>('/admin/products',{headers:{Authorization:`Bearer ${token}`}});
}
export function getDriveStatus(token:string) {
  return request<{provider:string;configured:boolean;authorized:boolean;folderUrl:string|null}>('/admin/media/status',
    {headers:{Authorization:`Bearer ${token}`}});
}
export async function uploadAdminProductImage(token:string,productId:string,file:File) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 6*1024*1024) {
    throw new Error('اختر صورة مدعومة لا تتجاوز 6 ميجابايت.');
  }
  const res = await fetch(endpoint(`/admin/products/${encodeURIComponent(productId)}/images`),{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':file.type},body:file
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error||`HTTP ${res.status}`);
  return data as {id:string;url:string};
}


export type Customer = {id:string;name:string;email:string};
export function customerStatus() {
  return request<{emailAvailable:boolean}>('/customer/status');
}
export function customerRegister(data:{name:string;email:string;password:string}) {
  return request<{message:string}>('/customer/register',{method:'POST',body:JSON.stringify(data)});
}
export function customerLogin(data:{email:string;password:string}) {
  return request<{token:string;user:Customer}>('/customer/login',{method:'POST',body:JSON.stringify(data)});
}
export function customerForgot(email:string) {
  return request<{message:string}>('/customer/forgot-password',{method:'POST',body:JSON.stringify({email})});
}
export function customerVerify(token:string) {
  return request<{message:string}>('/customer/verify-email',{method:'POST',body:JSON.stringify({token})});
}
export function customerReset(token:string,password:string) {
  return request<{message:string}>('/customer/reset-password',{method:'POST',body:JSON.stringify({token,password})});
}
export function customerMe(token:string) {
  return request<{user:Customer}>('/customer/me',{headers:{Authorization:`Bearer ${token}`}});
}


export type AccountProfile = Customer & {phone:string|null;emailVerifiedAt:string|null;createdAt:string};
export type CustomerAddress = {
  id:string;label:string;recipientName:string;phone:string;city:string;district:string;
  street:string;building:string|null;postalCode:string|null;additionalNumber:string|null;isDefault:boolean;
  latitude:number|null;longitude:number|null
};
export type CustomerAddressInput = {
  label:string;recipientName:string;phone:string;city:string;district:string;
  street:string;building:string;postalCode:string;additionalNumber:string;isDefault:boolean;
  latitude:number|null;longitude:number|null
};
export type DeliverySnapshot = {
  recipientName:string;phone:string;city:string;district:string;street:string;
  building:string|null;postalCode:string|null;additionalNumber:string|null;
  latitude:number|null;longitude:number|null;
};
export type AdminOrder = {
  id:string;orderNumber:string;state:string;createdAt:string;totalSar:string;
  customerName:string;customerEmail:string|null;guestPhone:string|null;
  delivery:DeliverySnapshot|null;
  items:{id:string;productNameAr:string;quantityItems:number}[];
  shipments:{id:string;state:string;carrier:string|null;trackingCode:string|null}[];
};
export function getAdminOrders(token:string) {
  return request<{orders:AdminOrder[]}>('/admin/orders',{
    headers:{Authorization:`Bearer ${token}`}
  });
}
export type CustomerOrder = {
  id:string;orderNumber:string;state:string;totalSar:string;createdAt:string;
  delivery:DeliverySnapshot|null;
  items:{id:string;productNameAr:string;quantityItems:number;unitPriceSar:string;totalPriceSar:string}[];
  shipments:{state:string;carrier:string|null;trackingCode:string|null}[];
};
const customerHeaders=(token:string)=>({Authorization:`Bearer ${token}`});
export function getAccountProfile(token:string) {
  return request<{user:AccountProfile}>('/account/profile',{headers:customerHeaders(token)});
}
export function updateAccountProfile(token:string,data:{name:string;phone:string}) {
  return request<{user:AccountProfile}>('/account/profile',{
    method:'PATCH',headers:customerHeaders(token),body:JSON.stringify(data)
  });
}
export function getCustomerAddresses(token:string) {
  return request<{addresses:CustomerAddress[]}>('/account/addresses',{headers:customerHeaders(token)});
}
export function createCustomerAddress(token:string,address:CustomerAddressInput) {
  return request<{address:CustomerAddress}>('/account/addresses',{
    method:'POST',headers:customerHeaders(token),body:JSON.stringify(address)
  });
}
export function updateCustomerAddress(token:string,id:string,address:CustomerAddressInput) {
  return request<{address:CustomerAddress}>(`/account/addresses/${encodeURIComponent(id)}`,{
    method:'PUT',headers:customerHeaders(token),body:JSON.stringify(address)
  });
}
export function defaultCustomerAddress(token:string,id:string) {
  return request<{message:string}>(`/account/addresses/${encodeURIComponent(id)}/default`,{
    method:'POST',headers:customerHeaders(token)
  });
}
export function deleteCustomerAddress(token:string,id:string) {
  return request<{message:string}>(`/account/addresses/${encodeURIComponent(id)}`,{
    method:'DELETE',headers:customerHeaders(token)
  });
}
export function getCustomerOrders(token:string) {
  return request<{orders:CustomerOrder[]}>('/account/orders',{headers:customerHeaders(token)});
}
