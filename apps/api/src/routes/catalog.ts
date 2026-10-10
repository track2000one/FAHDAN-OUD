import { Router } from 'express';
import { prisma } from '../lib/db.js';

export const catalogRouter = Router();

// Public selects intentionally EXCLUDE supplier, purchases, unit cost, margin and stock movements.
const productSelect = {
  id: true, slug: true, nameAr: true, nameEn: true, kind: true,
  originCountry: true, originRegion: true, grade: true,
  scentProfile: true, descriptionAr: true, projectionScore: true,
  longevityScore: true, uses: true, baseUnit: true, allowPreorder: true,
  isDemo: true,
  category: { select: { slug: true, nameAr: true } },
  media: { select: { kind: true, url: true, altAr: true }, orderBy: { sort: 'asc' as const } },
  balance: { select: { onHandBase: true, reservedBase: true } },
  variants: { where: { active: true }, select: {
    id: true, sku: true, labelAr: true, quantityBase: true,
    priceSar: true, compareAtPriceSar: true
  }, orderBy: { quantityBase: 'asc' as const } }
} as const;

function presentProduct(p: any) {
  const available = Math.max(0, Number(p.balance?.onHandBase ?? 0) - Number(p.balance?.reservedBase ?? 0));
  return {
    id: p.id, slug: p.slug, name: p.nameAr, kind: p.kind, origin: p.originCountry,
    region: p.originRegion, grade: p.grade, scent: p.scentProfile,
    description: p.descriptionAr, projection: p.projectionScore, longevity: p.longevityScore,
    uses: p.uses, baseUnit: p.baseUnit, preorder: p.allowPreorder, demo: p.isDemo,
    category: p.category, images: p.media.filter((m: {kind:string}) => m.kind === 'PHOTO'),
    videos: p.media.filter((m: {kind:string}) => m.kind === 'VIDEO'),
    availableBase: available,
    variants: p.variants.map((v: any) => ({
      id: v.id, sku: v.sku, label: v.labelAr, quantityBase: Number(v.quantityBase),
      price: Number(v.priceSar), compareAtPrice: v.compareAtPriceSar == null ? null : Number(v.compareAtPriceSar)
    }))
  };
}

catalogRouter.get('/categories', async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({ orderBy: { sort: 'asc' }, select: { slug: true, nameAr: true } });
    res.json(categories);
  } catch (e) { next(e); }
});

catalogRouter.get('/products', async (req, res, next) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const products = await prisma.product.findMany({
      where: { state: 'ACTIVE', ...(process.env.NODE_ENV === 'production' ? { isDemo: false } : {}),
        ...(category ? { category: { slug: category } } : {}) },
      select: productSelect,
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(products.map(presentProduct));
  } catch (e) { next(e); }
});

catalogRouter.get('/products/:slug', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({ where: { slug: req.params.slug, state: 'ACTIVE' }, select: productSelect });
    if (!product || (product.isDemo && process.env.NODE_ENV === 'production')) {
      res.status(404).json({ error: 'المنتج غير موجود.' }); return;
    }
    res.json(presentProduct(product));
  } catch (e) { next(e); }
});
