import type { Product } from './types';
const demoWeights = [10,20,28,36,50,100,125,250,500,1000];
const labels: Record<number,string> = {28:'أوقية (28 جم)',125:'ثُمن (125 جم)',250:'ربع كيلو (250 جم)',500:'نصف كيلو (500 جم)',1000:'كيلو (1000 جم)'};
function variants(slug: string, price28: number, stock: number, piece = false) {
  const sizes = piece ? [1] : demoWeights.filter(n => n<=stock);
  return sizes.map(g => ({ id:`demo-${slug}-${g}`, sku:`DEMO-${slug}-${g}`, label:piece?'بكج واحد':labels[g]??`${g} جم`, quantityBase:g,
    price:piece?price28:Math.round(price28*g/28*(g>=1000?.83:g>=500?.87:g>=250?.9:g>=125?.94:1)), compareAtPrice:null }));
}
const base = { region:null,projection:4,longevity:4,uses:['الضيافة','المناسبات'],preorder:false,demo:true,images:[],videos:[] };
export const demoProducts: Product[] = [
  { ...base,id:'demo-1',slug:'demo-marouki-double-super',name:'مروكي حي دبل سوبر',kind:'NATURAL_OUD',origin:'إندونيسيا (توضيحي)',grade:'دبل سوبر (توضيحي)',scent:'رائحة خشبية دافئة بلمسات راتنجية',description:'عرض توضيحي لتجربة تصميم فهدان، وليس منتجًا حقيقيًا معروضًا للبيع.',baseUnit:'GRAM',category:{slug:'natural-oud',nameAr:'عود طبيعي'},availableBase:765,variants:variants('marouki',265,765) },
  { ...base,id:'demo-2',slug:'demo-treated-oud',name:'عود مسقّى فاخر',kind:'TREATED_OUD',origin:'يحدد لاحقًا',grade:'فاخر',scent:'نفحات دافئة للضيافة',description:'منتج توضيحي غير متوفر للبيع.',baseUnit:'GRAM',category:{slug:'treated-oud',nameAr:'عود مسقّى'},availableBase:365,variants:variants('treated',165,365) },
  { ...base,id:'demo-3',slug:'demo-bakhoor',name:'بخور فهدان',kind:'BAKHOOR',origin:'يحدد لاحقًا',grade:'تركيبة تجريبية',scent:'نوتات بخورية دافئة',description:'تركيبة افتراضية للتصميم فقط.',baseUnit:'GRAM',category:{slug:'bakhoor',nameAr:'بخور'},availableBase:700,variants:variants('bakhoor',95,700) },
  { ...base,id:'demo-4',slug:'demo-gift-box',name:'بكج أثر الطيب',kind:'GIFT_BOX',origin:'باقة متنوعة',grade:'هدايا',scent:'بحسب محتويات الباقة',description:'باقة افتراضية للتصميم فقط.',baseUnit:'PIECE',category:{slug:'gift-box',nameAr:'هدايا وبكجات'},availableBase:12,variants:variants('gift',320,12,true) }
];
export const fallbackCategories = [
  {slug:'natural-oud',nameAr:'عود طبيعي'}, {slug:'treated-oud',nameAr:'عود مسقّى'}, {slug:'bakhoor',nameAr:'بخور'},
  {slug:'oud-oil',nameAr:'دهن عود'}, {slug:'frankincense',nameAr:'لبان وعلق ألبان'},
  {slug:'gift-box',nameAr:'هدايا وبكجات'}, {slug:'perfume',nameAr:'عطور'}
];
