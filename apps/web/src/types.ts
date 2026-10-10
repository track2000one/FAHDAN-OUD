export type Variant = { id: string; sku: string; label: string; quantityBase: number; price: number; compareAtPrice: number | null };
export type Product = {
  id: string; slug: string; name: string; kind: string; origin: string | null;
  region: string | null; grade: string | null; scent: string | null; description: string | null;
  projection: number | null; longevity: number | null; uses: string[];
  baseUnit: 'GRAM' | 'MILLILITER' | 'PIECE'; preorder: boolean; demo: boolean;
  category: { slug: string; nameAr: string }; images: { url:string; altAr: string|null }[];
  videos: { url:string; altAr: string|null }[]; availableBase: number; variants: Variant[];
};
export type CartLine = { sku: string; productId: string; slug: string; name: string; label: string; quantityBase: number; price: number; quantity: number; baseUnit: Product['baseUnit']; demo: boolean };
export type Dashboard = { totalProducts: number; openOrders: number; paidOrders: number; grossSalesSar: number; lowStock: { name: string; unit: string; available: number; threshold: number }[] };
