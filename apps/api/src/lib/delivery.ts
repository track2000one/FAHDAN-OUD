import type { CustomerAddress } from '@prisma/client';
import { prisma } from './db.js';

export type DeliverySnapshot = {
  recipientName: string;
  phone: string;
  city: string;
  district: string;
  street: string;
  building: string | null;
  postalCode: string | null;
  additionalNumber: string | null;
  latitude: number | null;
  longitude: number | null;
};

function validPoint(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

const objectRecord = (input: unknown): Record<string, unknown> | null =>
  input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : null;

const stringField = (o: Record<string, unknown>, key: string) =>
  typeof o[key] === 'string' ? (o[key] as string).slice(0, 200) : '';

const optionalField = (o: Record<string, unknown>, key: string) =>
  stringField(o, key) || null;

/**
 * Read-only projection: do not read the customer's current address book
 * while rendering historical orders. Order snapshots must not drift.
 */
export function deliveryFromOrderSnapshot(value: unknown): DeliverySnapshot | null {
  const row = objectRecord(value);
  if (!row) return null;
  const latitude = row.latitude;
  const longitude = row.longitude;
  const hasPoint = validPoint(latitude, longitude);
  return {
    recipientName: stringField(row, 'recipientName') || stringField(row, 'name'),
    phone: stringField(row, 'phone'),
    city: stringField(row, 'city'),
    district: stringField(row, 'district'),
    street: stringField(row, 'street'),
    building: optionalField(row, 'building'),
    postalCode: optionalField(row, 'postalCode'),
    additionalNumber: optionalField(row, 'additionalNumber'),
    latitude: hasPoint ? latitude : null,
    longitude: hasPoint ? longitude as number : null
  };
}

export class MissingDeliveryLocation extends Error {}

/**
 * Intended for the future checkout transaction, not for public order creation.
 * A customer's chosen address must belong to that customer and contain
 * an accurate, customer-confirmed pin before a home-delivery order is created.
 * Store the returned OBJECT as Order.addressSnapshot inside that transaction.
 */
export async function snapshotVerifiedCustomerDeliveryAddress(customerId: string, addressId: string) {
  const addr = await prisma.customerAddress.findFirst({ where: { id: addressId, userId: customerId } });
  if (!addr) throw new MissingDeliveryLocation('عنوان التوصيل غير موجود ضمن حساب العميل.');
  if (!validPoint(addr.latitude, addr.longitude)) {
    throw new MissingDeliveryLocation('يجب تحديد موقع المنزل على الخريطة قبل تأكيد طلب التوصيل.');
  }
  return {
    recipientName: addr.recipientName,
    phone: addr.phone,
    city: addr.city,
    district: addr.district,
    street: addr.street,
    building: addr.building,
    postalCode: addr.postalCode,
    additionalNumber: addr.additionalNumber,
    latitude: addr.latitude,
    longitude: addr.longitude
  } satisfies DeliverySnapshot;
}
