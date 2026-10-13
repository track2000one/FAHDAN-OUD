import type { Dashboard, Product } from './types';
import { demoProducts, fallbackCategories } from './demo';
const base = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const endpoint = (path:string) => `${base}/api/v1${path}`;

export type ProductIntakeIssue = {field:string;label:string;message:string};
export class ProductIntakeValidationError extends Error {
  constructor(message:string,public issues:ProductIntakeIssue[]){
    super(message);
    this.name='ProductIntakeValidationError';
  }
}
async function request<T>(path:string, options?:RequestInit):Promise<T> {
  const response = await fetch(endpoint(path), { ...options, headers:{ 'Content-Type':'application/json', ...options?.headers } });
  const body = await response.json();
  if (!response.ok) {
    if(path==='/admin/products' && Array.isArray(body?.validationErrors)) {
      throw new ProductIntakeValidationError(
        body.error || 'تحقق من بيانات المنتج.',
        body.validationErrors as ProductIntakeIssue[]
      );
    }
    throw new Error(body?.error || `HTTP ${response.status}`);
  }
  return body as T;
}
export async function getCatalog(): Promise<{ products:Product[]; categories:{slug:string;nameAr:string}[]; connected:boolean }> {
  try {
    const [products,categories] = await Promise.all([
      request<Product[]>('/products'), request<{slug:string;nameAr:string}[]>('/categories')
    ]);
    return {products,categories,connected:true};
  } catch {
    return {products:import.meta.env.PROD?[]:demoProducts,categories:fallbackCategories,connected:false};
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

export type AdminReviewVariant={
  id:string;sku:string;labelAr:string;quantityBase:string;
  priceSar:string;compareAtPriceSar:string;active:boolean;
};
export type AdminReviewProduct={
  id:string;slug:string;nameAr:string;kind:string;baseUnit:string;
  state:'DRAFT'|'ACTIVE'|'ARCHIVED'|'OUT_OF_STOCK';
  originCountry:string;originRegion:string;grade:string;scentProfile:string;
  descriptionAr:string;projectionScore:number|null;longevityScore:number|null;
  createdAt:string;updatedAt:string;availableBase:string;onHandBase:string;reorderPoint:string;
  variants:AdminReviewVariant[];photos:{id:string;altAr:string|null;sort:number}[];
  purchase:{supplierName:string;receivedAt:string;invoiceReference:string|null;
    quantityBase:string;totalCostSar:string}|null;
};
export type AdminReviewEdit={
  nameAr:string;originCountry:string;originRegion:string;grade:string;scentProfile:string;
  descriptionAr:string;projectionScore:number|null;longevityScore:number|null;
  variants:{id:string;priceSar:string;compareAtPriceSar:string}[];
};
export function getAdminReviewProducts(token:string){
  return request<{products:AdminReviewProduct[]}>('/admin/products/review',{
    headers:{Authorization:`Bearer ${token}`}
  });
}
export function saveAdminReviewProduct(token:string,id:string,details:AdminReviewEdit){
  return request<{id:string;message:string}>(`/admin/products/${encodeURIComponent(id)}/review`,{
    method:'PATCH',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(details)
  });
}
export async function getAdminReviewPhoto(token:string,productId:string,photoId:string){
  const response=await fetch(endpoint(
    `/admin/products/${encodeURIComponent(productId)}/photos/${encodeURIComponent(photoId)}`
  ),{headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok)throw new Error('تعذر تحميل صورة المنتج للمراجعة.');
  return response.blob();
}
export type AdminProduct = {id:string;name:string;status:string;unit:string;onHand:number;reserved:number;reorderPoint:number;variantCount:number;imageCount:number};
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


export type CheckoutCartItem = {variantId:string;quantity:number};
export type CheckoutQuote = {
  items:{variantId:string;sku:string;name:string;label:string;quantity:number;
    unitPriceSar:string;lineTotalSar:string}[];
  subtotalSar:string;shippingSar:null;taxSar:null;amountDueSar:null;
  preliminary:true;notice:string;
};
export function getCheckoutQuote(token:string,items:CheckoutCartItem[]) {
  return request<CheckoutQuote>('/checkout/quote',{
    method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({items})
  });
}
export function submitPreliminaryOrder(token:string,data:{
  addressId:string;items:CheckoutCartItem[];requestKey:string;acknowledged:true
}){
  return request<{orderNumber:string;state:string;duplicate:boolean}>('/checkout/request',{
    method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(data)
  });
}

export type NewProductVariant = {quantity:string;priceSar:string;compareAtPriceSar:string};
export type NewProductIntake = {
  code:string;nameAr:string;kind:string;
  originCountry:string;originRegion:string;grade:string;scentProfile:string;
  descriptionAr:string;projectionScore:number|null;longevityScore:number|null;
  supplierName:string;supplierContact:string;receivedAt:string;invoiceReference:string;
  stockQuantity:string;landedCostSar:string;reorderPoint:string;
  variants:NewProductVariant[];
};
export function createAdminProduct(token:string,data:NewProductIntake) {
  return request<{product:{id:string;nameAr:string;slug:string};message:string}>('/admin/products',{
    method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(data)
  });
}
export function setAdminProductPublishing(token:string,productId:string,state:'DRAFT'|'ACTIVE',confirmed=false) {
  return request<{product:{id:string;state:string;slug:string};message:string}>(
    `/admin/products/${encodeURIComponent(productId)}/publishing`,{
      method:'PATCH',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({state,confirmed})
    });
}

export type AdminStockSnapshot = {
  balance:{onHandBase:string;reservedBase:string;availableBase:string;reorderPoint:string;version:number}|null;
  movements:{id:string;kind:string;deltaBase:string;reason:string|null;createdAt:string;sourceRef:string|null}[];
};
export function getAdminProductStock(token:string,productId:string){
  return request<AdminStockSnapshot>(
    `/admin/manage/products/${encodeURIComponent(productId)}/stock`,{
      headers:{Authorization:`Bearer ${token}`}
    });
}
export function receiveAdminStock(token:string,productId:string,data:{
  requestKey:string;quantityBase:string;totalCostSar:string;supplierName:string;
  invoiceReference:string;receivedAt:string
}){
  return request<AdminStockSnapshot&{message:string}>(
    `/admin/manage/products/${encodeURIComponent(productId)}/stock/receipt`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(data)
    });
}
export function writeOffAdminStock(token:string,productId:string,data:{
  requestKey:string;quantityBase:string;kind:'LOSS'|'DAMAGE'|'ADJUSTMENT';reason:string
}){
  return request<AdminStockSnapshot&{message:string}>(
    `/admin/manage/products/${encodeURIComponent(productId)}/stock/writeoff`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(data)
    });
}
export function reorderAdminProductPhotos(token:string,productId:string,photoIds:string[]){
  return request<{message:string}>(`/admin/manage/products/${encodeURIComponent(productId)}/photos/order`,{
    method:'PUT',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({photoIds})
  });
}
export function removeAdminProductPhoto(token:string,productId:string,photoId:string){
  return request<{message:string;cleanupPending:boolean}>(
    `/admin/manage/products/${encodeURIComponent(productId)}/photos/${encodeURIComponent(photoId)}`,{
      method:'DELETE',headers:{Authorization:`Bearer ${token}`}
    });
}


export type ReturnKind='RETURN'|'EXCHANGE';
export type ReturnReason='CHANGED_MIND'|'WRONG_ITEM'|'DAMAGED'|'DEFECTIVE'|'NOT_AS_DESCRIBED'|'OTHER';
export type ReturnStatus='SUBMITTED'|'NEEDS_INFORMATION'|'APPROVED'|'REJECTED'|'ITEM_RECEIVED';
export type ReturnRequestRecord={
  id:string;customerId:string;orderId:string;orderItemId:string;
  kind:ReturnKind;reason:ReturnReason;quantity:number;explanation:string;
  itemOpened:boolean|null;status:ReturnStatus;decisionNote:string|null;
  reviewedAt:string|null;createdAt:string;updatedAt:string;
  order:{orderNumber:string;createdAt:string};
  orderItem:{productNameAr:string;skuSnapshot:string;quantityItems:number};
};
export type AdminReturnRecord=ReturnRequestRecord&{
  customer:{name:string;email:string;phone:string|null};
};
export function getCustomerReturns(token:string){
  return request<{requests:ReturnRequestRecord[]}>('/account/returns',{
    headers:{Authorization:`Bearer ${token}`}
  });
}
export function createCustomerReturn(token:string,data:{
  orderItemId:string;quantity:number;kind:ReturnKind;reason:ReturnReason;
  explanation:string;itemOpened:boolean;
}){
  return request<{request:ReturnRequestRecord;message:string}>('/account/returns',{
    method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(data)
  });
}
export function replyCustomerReturn(token:string,id:string,explanation:string){
  return request<{message:string}>(`/account/returns/${encodeURIComponent(id)}/reply`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({explanation})
  });
}
export function getAdminReturns(token:string){
  return request<{requests:AdminReturnRecord[]}>('/admin/returns',{
    headers:{Authorization:`Bearer ${token}`}
  });
}
export function reviewAdminReturn(token:string,id:string,status:Exclude<ReturnStatus,'SUBMITTED'>,note:string){
  return request<{id:string;message:string}>(`/admin/returns/${encodeURIComponent(id)}/review`,{
    method:'PATCH',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({status,note})
  });
}
export type OrderDocument={
  kind:'PRELIMINARY_ORDER'|'PURCHASE_RECEIPT';
  taxInvoice:false;documentNumber:string;createdAt:string;paidAt:string|null;
  state:string;customerName:string;customerEmail:string|null;sellerName:string;
  address:DeliverySnapshot|null;
  items:{id:string;productNameAr:string;skuSnapshot:string;quantityItems:number;
    eachBase:string;unitPriceSar:string;totalPriceSar:string}[];
  subtotalSar:string;discountSar:string;shippingSar:string|null;taxSar:string|null;
  giftWrapFeeSar:string;totalSar:string|null;notice:string;
};
export function getCustomerOrderDocument(token:string,id:string){
  return request<{document:OrderDocument}>(`/account/orders/${encodeURIComponent(id)}/document`,{
    headers:{Authorization:`Bearer ${token}`}
  });
}
