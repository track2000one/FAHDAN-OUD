import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/db.js';

export const authRouter = Router();
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

authRouter.post('/login', async (req, res, next) => {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: 'تحقق من البريد الإلكتروني وكلمة المرور.' }); return; }
    const user = await prisma.user.findUnique({ where: { email: result.data.email.trim().toLowerCase() } });
    const valid = user?.passwordHash ? await bcrypt.compare(result.data.password, user.passwordHash) : false;
    if (!valid || !user?.enabled || (user.role !== 'OWNER' && user.role !== 'ADMIN')) {
      res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' }); return;
    }
    const token = jwt.sign({ role: user.role }, process.env.JWT_SECRET!, { subject: user.id, expiresIn: '2h' });
    res.json({ token, user: { name: user.name, role: user.role } });
  } catch (e) { next(e); }
});
