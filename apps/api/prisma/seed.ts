import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, type ProductKind, type BaseUnit } from '@prisma/client';

const prisma = new PrismaClient();
const categories = [
  { slug: 'natural-oud', nameAr: 'عود طبيعي', sort: 1 },
  { slug: 'treated-oud', nameAr: 'عود مسقّى', sort: 2 },
  { slug: 'bakhoor', nameAr: 'بخور', sort: 3 },
  { slug: 'oud-oil', nameAr: 'دهن عود', sort: 4 },
  { slug: 'frankincense', nameAr: 'لبان وعلق ألبان', sort: 5 },
  { slug: 'gift-box', nameAr: 'هدايا وبكجات', sort: 6 },
  { slug: 'perfume', nameAr: 'عطور', sort: 7 }
];

const demoProducts: { slug: string; nameAr: string; category: string; kind: ProductKind;
  origin: string; grade: string; scent: string; description: string;
  price28: number; stock: number; baseUnit: BaseUnit; }[] = [
  { slug: 'demo-marouki-double-super', nameAr: 'مروكي حي دبل سوبر', category: 'natural-oud',
    kind: 'NATURAL_OUD', origin: 'إندونيسيا (توضيحي)', grade: 'دبل سوبر (توضيحي)',
    scent: 'نفحات خشبية دافئة', description: 'منتج تجريبي لتوضيح التصميم، وليس عرضًا تجاريًا.',
    price28: 265, stock: 765, baseUnit: 'GRAM' },
  { slug: 'demo-treated-oud', nameAr: 'عود مسقّى فاخر', category: 'treated-oud',
    kind: 'TREATED_OUD', origin: 'يحدد لاحقًا', grade: 'فاخر (توضيحي)',
    scent: 'طابع دافئ للضيافة', description: 'مثال تجريبي، ليس عرضًا للبيع.',
    price28: 165, stock: 365, baseUnit: 'GRAM' },
  { slug: 'demo-bakhoor', nameAr: 'بخور فهدان', category: 'bakhoor',
    kind: 'BAKHOOR', origin: 'يحدد لاحقًا', grade: 'تركيبة تجريبية',
    scent: 'خليط بخوري توضيحي', description: 'مثال تجريبي، وليس تركيبة معتمدة.',
    price28: 95, stock: 700, baseUnit: 'GRAM' },
  { slug: 'demo-gift-box', nameAr: 'بكج أثر الطيب', category: 'gift-box',
    kind: 'GIFT_BOX', origin: 'باقة متنوعة', grade: 'باقة هدايا',
    scent: 'بحسب محتويات الباقة', description: 'بكج تجريبي لا يمثل منتجات معتمدة.',
    price28: 320, stock: 12, baseUnit: 'PIECE' }
];

async function main() {
  for (const category of categories) {
    await prisma.category.upsert({ where: { slug: category.slug }, create: category, update: { nameAr: category.nameAr, sort: category.sort } });
  }
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password && email.includes('@') && password.length >= 16 && !password.includes('replace_with_')) {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({ where: { email }, create: { email, name: 'مالك فهدان', passwordHash, role: 'OWNER' },
      update: { passwordHash, role: 'OWNER', enabled: true } });
    console.log('Owner user provisioned. Change/remove ADMIN_PASSWORD from environment after setup.');
  } else {
    // Diagnostic flags only. Never log an email, password, hash or token.
    console.log('Owner setup checks:', JSON.stringify({
      emailProvided: Boolean(email),
      emailContainsAt: Boolean(email?.includes('@')),
      passwordProvided: Boolean(password),
      passwordAtLeast16: Boolean(password && password.length >= 16),
      passwordNotPlaceholder: Boolean(password && !password.includes('replace_with_'))
    }));
    console.log('Owner not created. Correct failed setup checks before retrying.');
  }
  if (process.env.SEED_DEMO !== 'true') {
    console.log('Categories ready. Demo products skipped (SEED_DEMO != true).');
    return;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seed is forbidden in production.');
  const weights = [10, 20, 28, 36, 50, 100, 125, 250, 500, 1000];
  const label = (g: number) => ({ 28: 'أوقية (28 جم)', 125: 'ثُمن (125 جم)', 250: 'ربع كيلو (250 جم)',
    500: 'نصف كيلو (500 جم)', 1000: 'كيلو (1000 جم)' } as Record<number,string>)[g] ?? `${g} جم`;
  for (const d of demoProducts) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: d.category } });
    const product = await prisma.product.upsert({
      where: { slug: d.slug },
      create: { slug: d.slug, nameAr: d.nameAr, kind: d.kind, categoryId: category.id,
        originCountry: d.origin, grade: d.grade, scentProfile: d.scent,
        descriptionAr: d.description, baseUnit: d.baseUnit, state: 'ACTIVE', isDemo: true },
      update: { nameAr: d.nameAr, isDemo: true, state: 'ACTIVE' }
    });
    const grams = d.kind === 'GIFT_BOX' ? [1] : weights.filter(g => g <= d.stock);
    for (const gramsAmount of grams) {
      const discount = gramsAmount >= 1000 ? 0.83 : gramsAmount >= 500 ? 0.87 : gramsAmount >= 250 ? 0.90 : gramsAmount >= 125 ? 0.94 : 1;
      const price = d.kind === 'GIFT_BOX' ? d.price28 : Math.round(d.price28 * gramsAmount / 28 * discount);
      const sku = `DEMO-${d.slug}-${gramsAmount}`;
      await prisma.productVariant.upsert({ where: { sku }, create: { productId: product.id,
        sku, labelAr: d.kind === 'GIFT_BOX' ? 'بكج واحد' : label(gramsAmount), quantityBase: gramsAmount, priceSar: price },
        update: { labelAr: d.kind === 'GIFT_BOX' ? 'بكج واحد' : label(gramsAmount), priceSar: price } });
    }
    await prisma.inventoryBalance.upsert({ where: { productId: product.id }, create: { productId: product.id,
      onHandBase: d.stock, reorderPoint: d.kind === 'GIFT_BOX' ? 3 : 50 }, update: {} });
  }
  console.log('Demo products seeded. They are not shown by the public API in production.');
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
