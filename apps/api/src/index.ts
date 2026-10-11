import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from './lib/db.js';
import { catalogRouter } from './routes/catalog.js';
import { authRouter } from './routes/auth.js';
import { customerRouter } from './routes/customer.js';
import { accountRouter } from './routes/account.js';
import { adminRouter } from './routes/admin.js';
import { mediaRouter } from './routes/media.js';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development','test','production']).default('development')
});
const env = envSchema.parse(process.env);
if (env.NODE_ENV === 'production' && env.JWT_SECRET.includes('replace_with_')) {
  throw new Error('Production requires a secure JWT_SECRET.');
}

const app = express();
// Railway terminates HTTPS at its edge proxy; trust exactly one forwarding hop.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  // OpenFreeMap vector maps require style/tile/glyph connections and a same-origin MapLibre worker.
  // Keep all other Helmet CSP directives at their restrictive defaults.
  contentSecurityPolicy: {
    directives: {
      'connect-src': ["'self'", 'https://tiles.openfreemap.org', 'https://assets.openfreemap.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://tiles.openfreemap.org', 'https://assets.openfreemap.com'],
      'worker-src': ["'self'"]
    }
  }
}));
app.use(cors({ origin: env.WEB_ORIGIN }));
app.use(express.json({ limit: '64kb' }));

app.get('/api/v1/health', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok', database: 'connected' }); }
  catch { res.status(503).json({ status: 'unavailable', database: 'disconnected' }); }
});
app.use('/api/v1', catalogRouter);
app.use('/api/v1', mediaRouter);
app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }), authRouter);
app.use('/api/v1/customer', rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false }), customerRouter);
app.use('/api/v1/account', accountRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'المسار غير موجود.' }));

// Railway production: the API and built React app are hosted on one service and domain.
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
app.use(express.static(webDist, { index: 'index.html', maxAge: '1h' }));
app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('API error:', err);
  res.status(500).json({ error: 'حدث خطأ في الخادم.' });
};
app.use(errorHandler);
const server = app.listen(env.PORT, () => console.log(`Fahdan API: http://localhost:${env.PORT}`));

function shutdown() {
  server.close(() => void prisma.$disconnect().then(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
