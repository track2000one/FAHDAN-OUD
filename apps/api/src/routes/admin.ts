import { Router, raw } from 'express';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { driveStatus, uploadImage, deleteImage, isImage } from '../lib/google-drive.js';
import { prisma } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { deliveryFromOrderSnapshot } from '../lib/delivery.js';

export const adminRouter = Router();
adminRouter.use(requireOwner);

adminRouter.get('/dashboard', async (_req, res, next) => {
  try {
    const [totalProducts, openOrders, orderSummary, balances] = await Promise.all([
      prisma.product.count({ where: { isDemo: false } }),
      prisma.order.count({ where: { state: { in: ['AWAITING_REVIEW', 'PENDING_PAYMENT', 'PAID', 'PREPARING'] } } }),
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
        _count: { select: { media: { where: { kind: 'PHOTO' } } } },
        variants: { select: { labelAr: true, priceSar: true, quantityBase: true } }
      }
    });
    res.json(products.map(p => ({
      id: p.id, name: p.nameAr, slug: p.slug, status: p.state, unit: p.baseUnit,
      onHand: Number(p.balance?.onHandBase ?? 0), reserved: Number(p.balance?.reservedBase ?? 0),
      reorderPoint: Number(p.balance?.reorderPoint ?? 0),
      variantCount: p.variants.length, imageCount: p._count.media
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
    const product = await prisma.product.findUnique({where:{id:req.params.productId},select:{id:true,nameAr:true,isDemo:true,state:true}});
    if (!product || product.isDemo) {res.status(404).json({error:'المنتج الفعلي غير موجود.'});return;}
    if(product.state!=='DRAFT') {res.status(409).json({error:'أوقف نشر المنتج قبل إضافة صور جديدة، ثم أعد اعتماد المنتج.'});return;}
    // Images are uploaded one at a time by the multi-select UI. Enforce the
    // total count on the server, not just in the browser.
    const existingCount = await prisma.productMedia.count({where:{productId:product.id,kind:'PHOTO'}});
    if (existingCount>=12) {res.status(409).json({error:'الحد الأقصى 12 صورة لكل منتج.'});return;}
    const fileId = await uploadImage(req.body,mime);
    const mediaId = randomUUID();
    try {
      // A serializable transaction prevents concurrent uploads from silently
      // exceeding the limit or sharing the same sort position.
      const media = await prisma.$transaction(async tx => {
        const photos = await tx.productMedia.findMany({
          where:{productId:product.id,kind:'PHOTO'},select:{sort:true}
        });
        if (photos.length>=12) throw new Error('PHOTO_LIMIT_REACHED');
        const sort = photos.reduce((max,photo)=>Math.max(max,photo.sort),-1)+1;
        return tx.productMedia.create({data:{
          id:mediaId,productId:product.id,kind:'PHOTO',driveFileId:fileId,
          url:`/api/v1/media/${mediaId}`,altAr:product.nameAr,sort
        }});
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
      res.status(201).json({id:media.id,url:media.url,sort:media.sort});
    } catch (err) {
      try { await deleteImage(fileId); } catch { console.error('Google Drive cleanup after DB failure was unsuccessful.'); }
      if(err instanceof Error && err.message==='PHOTO_LIMIT_REACHED') {
        res.status(409).json({error:'الحد الأقصى 12 صورة لكل منتج.'});return;
      }
      if(err instanceof Prisma.PrismaClientKnownRequestError && err.code==='P2034'){
        res.status(409).json({error:'جارٍ رفع صورة أخرى لهذا المنتج. أعد المحاولة.'});return;
      }
      throw err;
    }
  } catch(err) {next(err);}
});


// Authenticated owner/administrator view only; never expose recipient details on public routes.
adminRouter.get('/orders', async (_req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, orderNumber: true, state: true, createdAt: true,
        totalSar: true, addressSnapshot: true, guestName: true, guestPhone: true,
        customer: { select: { name: true, email: true } },
        items: { select: { id: true, productNameAr: true, quantityItems: true } },
        shipments: { select: { id: true, state: true, carrier: true, trackingCode: true } }
      }
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ orders: orders.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      state: order.state,
      createdAt: order.createdAt,
      totalSar: order.totalSar.toString(),
      customerName: order.customer?.name || order.guestName || 'عميل',
      customerEmail: order.customer?.email || null,
      guestPhone: order.guestPhone,
      delivery: deliveryFromOrderSnapshot(order.addressSnapshot),
      items: order.items,
      shipments: order.shipments
    })) });
  } catch(e) { next(e); }
});
