import type { Request, Response, NextFunction } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { prisma } from './db.js';

export async function requireOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authorization = req.headers.authorization ?? '';
  if (!authorization.startsWith('Bearer ')) {
    res.status(401).json({ error: 'يجب تسجيل الدخول أولًا.' });
    return;
  }
  try {
    const decoded = jwt.verify(authorization.slice(7), process.env.JWT_SECRET ?? '') as JwtPayload;
    if (typeof decoded.sub !== 'string') throw new Error('Invalid user');
    const user = await prisma.user.findUnique({ where: { id: decoded.sub }, select: { role: true, enabled: true } });
    if (!user?.enabled || (user.role !== 'OWNER' && user.role !== 'ADMIN')) {
      res.status(403).json({ error: 'ليس لديك صلاحية للوصول.' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'انتهت الجلسة أو أن بيانات الدخول غير صحيحة.' });
  }
}
