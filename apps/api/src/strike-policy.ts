import { Prisma } from '@prisma/client';
import { Database } from './database';
export const paymentGraceMs = 24 * 60 * 60 * 1000;
export const strikeLimit = 3;
export function currentStrikes(now = new Date()): Prisma.StrikeWhereInput {
  return { revokedAt: null, AND: [
    { OR: [{ permanent: true }, { expiresAt: null }, { expiresAt: { gt: now } }] },
    { OR: [{ reason: { not: 'MISSED_PAYMENT' } }, { signup: { status: 'CONFIRMED', event: { status: { in: ['PUBLISHED', 'COMPLETED'] }, deletedAt: null, endsAt: { lte: new Date(now.getTime() - paymentGraceMs) } }, payment: { amountCents: { gt: 0 }, status: { not: 'VOID' }, organizerPaid: false } } }] }
  ] };
}
export async function syncEventPaymentStrikes(tx: Prisma.TransactionClient, eventId: string) {
  const now = new Date();
  const event = await tx.event.findUnique({ where: { id: eventId } });
  if (!event || event.deletedAt || !['PUBLISHED', 'COMPLETED'].includes(event.status) || event.endsAt.getTime() + paymentGraceMs > now.getTime()) return;
  const seats = await tx.signup.findMany({ where: { eventId, status: 'CONFIRMED', payment: { amountCents: { gt: 0 }, status: { not: 'VOID' }, organizerPaid: false } }, include: { payment: true }, orderBy: [{ userId: 'asc' }, { id: 'asc' }] });
  for (const seat of seats) {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${seat.userId}::uuid FOR UPDATE`;
    const existing = await tx.strike.findUnique({ where: { signupId_reason: { signupId: seat.id, reason: 'MISSED_PAYMENT' } } });
    if (existing && !existing.revokedAt) continue;
    const actorId = seat.payment?.organizerReviewedById ?? event.organizerId;
    const data = { automatic: true, note: 'Organizer marked payment not received after the 24-hour grace period.', revokedAt: null, expiresAt: null };
    const strike = existing ? await tx.strike.update({ where: { id: existing.id }, data }) : await tx.strike.create({ data: { ...data, userId: seat.userId, signupId: seat.id, reason: 'MISSED_PAYMENT', issuedById: actorId } });
    await tx.auditLog.create({ data: { actorId, eventId, action: 'PAYMENT_STRIKE_APPLIED', details: { signupId: seat.id, strikeId: strike.id, guest: seat.guestNumber > 0 } } });
    await tx.notification.upsert({ where: { dedupeKey: `strike:${strike.id}` }, update: { readAt: null }, create: { userId: seat.userId, kind: 'PAYMENT_STRIKE', dedupeKey: `strike:${strike.id}`, payload: { eventId, bookingId: seat.bookingId, title: `Payment discrepancy: ${event.title}`, signupId: seat.id } } });
  }
}
// Refresh on authenticated reads and before new bookings. No external scheduler is needed.
export async function refreshPaymentStrikes(db: Database, userIds?: string[]) {
  if (userIds && !userIds.length) return;
  const events = await db.event.findMany({ where: { deletedAt: null, status: { in: ['PUBLISHED', 'COMPLETED'] }, endsAt: { lte: new Date(Date.now() - paymentGraceMs) }, signups: { some: { ...(userIds ? { userId: { in: userIds } } : {}), status: 'CONFIRMED', payment: { amountCents: { gt: 0 }, status: { not: 'VOID' }, organizerPaid: false } } } }, select: { id: true }, orderBy: { id: 'asc' } });
  for (const event of events) await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${event.id}::uuid FOR UPDATE`;
    await syncEventPaymentStrikes(tx, event.id);
  }, { maxWait: 10000, timeout: 15000 });
}
