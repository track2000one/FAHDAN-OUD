import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { readImage } from '../lib/google-drive.js';
export const mediaRouter = Router();

// Product images remain private in Drive; only images of published items are served.
mediaRouter.get('/media/:id', async (req,res,next) => {
  try {
    const media = await prisma.productMedia.findUnique({ where: { id: req.params.id },
      select: { kind:true, driveFileId:true, product:{ select:{ state:true,isDemo:true } } } });
    if (!media?.driveFileId || media.kind !== 'PHOTO' || media.product.state !== 'ACTIVE' || media.product.isDemo) {
      res.status(404).json({ error: 'الصورة غير موجودة.' }); return;
    }
    const data = await readImage(media.driveFileId);
    res.setHeader('Content-Type',data.mime);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','public,max-age=3600,stale-while-revalidate=3600');
    res.send(data.bytes);
  } catch(e) { next(e); }
});
