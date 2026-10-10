import { Router, raw } from 'express';
import { randomUUID } from 'node:crypto';
import { driveStatus, uploadImage, deleteImage, isImage } from '../lib/google-drive.js';
import { prisma } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';

export const adminRouter = Router();
adminRouter.use(requireOwner);

adminRouter.get('/dashboard', async (_req, res, next) => {
  try {
    const [totalProducts, openOrders, orderSummary, balances] = await Promise.all([
      prisma.product.count({ where: { isDemo: false } }),
      prisma.order.count({ where: { state: { in: ['PENDING_PAYMENT', 'PAID', 'PREPARING'] } } }),
      prisma.order.aggregate({
        where: { state: { in: ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED'] } },
        _sum: { totalSar: true }, _count: true
      }),
      prisma.inventoryBalance.findMany({
        where: { product: { isDemo: false } },
        select: { onHandBase: true, reservedBase: true, reorderPoint: true,
          product: { select: { nameAr: true, baseUnit: true } } }
      })
    ]);
    const lowStock = balances.filter(b => Number(b.onHandBase) - Number(b.reservedBase) <= Number(b.reorderPoint));
    res.json({
      totalProducts, openOrders, paidOrders: orderSummary._count,
      grossSalesSar: Number(orderSummary._sum.totalSar ?? 0),
      lowStock: lowStock.map(b => ({ name: b.product.nameAr, unit: b.product.baseUnit,
        available: Number(b.onHandBase) - Number(b.reservedBase), threshold: Number(b.reorderPoint) }))
    });
  } catch (e) { next(e); }
});

adminRouter.get('/products', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { isDemo: false }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, nameAr: true, slug: true, state: true, baseUnit: true,
        balance: { select: { onHandBase: true, reservedBase: true, reorderPoint: true } },
        variants: { select: { labelAr: true, priceSar: true, quantityBase: true } }
      }
    });
    res.json(products.map(p => ({
      id: p.id, name: p.nameAr, slug: p.slug, status: p.state, unit: p.baseUnit,
      onHand: Number(p.balance?.onHandBase ?? 0), reserved: Number(p.balance?.reservedBase ?? 0),
      reorderPoint: Number(p.balance?.reorderPoint ?? 0),
      variantCount: p.variants.length
    })));
  } catch (e) { next(e); }
});

adminRouter.get('/media/status', async (_req, res) => {
  try { const status = await driveStatus(); res.json({ provider: 'google-drive', ...status }); }
  catch { res.status(503).json({ provider: 'google-drive', configured: true, authorized: false, folderUrl: null,
    error: 'تعذر اتصال Google Drive؛ راجع تفويض الحساب أو صلاحيات المجلد.' }); }
});

adminRouter.post('/products/:productId/images', raw({ type: ['image/jpeg','image/png','image/webp'], limit:'6mb' }), async (req,res,next) => {
  try {
    const mime = (req.headers['content-type'] || '').split(';')[0].trim();
    if (!Buffer.isBuffer(req.body) || !isImage(req.body, mime)) {
      res.status(400).json({error:'اختر صورة JPG أو PNG أو WEBP لا تتجاوز 6 ميجابايت.'}); return;
    }
    const product = await prisma.product.findUnique({where:{id:req.params.productId},select:{id:true,nameAr:true}});
    if (!product) {res.status(404).json({error:'المنتج غير موجود.'});return;}
    const fileId = await uploadImage(req.body,mime);
    const mediaId = randomUUID();
    try {
      const media = await prisma.productMedia.create({data:{
        id:mediaId,productId:product.id,kind:'PHOTO',driveFileId:fileId,
        url:`/api/v1/media/${mediaId}`,altAr:product.nameAr,sort:0
      }});
      res.status(201).json({id:media.id,url:media.url});
    } catch (err) {
      try { await deleteImage(fileId); } catch { console.error('Google Drive cleanup after DB failure was unsuccessful.'); }
      throw err;
    }
  } catch(err) {next(err);}
});
