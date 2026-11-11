import { managedEvents, managesEvent } from './event-organizers';
import { Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthRequest, FirebaseGuard } from './auth';
import { Database } from './database';
import { paymentGraceMs, refreshPaymentStrikes } from './strike-policy';
import { uuid } from './validation';

const descriptions: Record<string, string> = {
  ORGANIZER_REVIEW_REMINDER: 'This game has ended. Review the player roster to record attendance and payment received. Administrators complete the final sign-off after players have had an opportunity to resolve discrepancies.',
  STALE_EVENT_REVIEW_REMINDER: 'This game ended at least one week ago and its review is still unfinished. Organizers should finish recording attendance and payments; administrators should review outstanding discrepancies before final sign-off.',
  PAYMENT_REVIEW_REMINDER: 'It has been over 24 hours since this event ended. Please mark whether you paid for your seat and any guests. Your report helps you and the organizer resolve differences; the organizer confirms payment received.',
  PAYMENT_STRIKE: 'The organizer marked a seat unpaid after the 24-hour grace period. This counts toward the 3-strike joining limit. Open My profile for details and contact the organizer to resolve it. Your own payment report does not clear the strike.',
  ADMIN_PERMANENT_STRIKE: 'An administrator issued a permanent strike. It counts toward the 3-strike joining limit and does not expire. View the reason in My profile.',
  STRIKE_CLEARED: 'A strike has been cleared. Open My profile for your current count.',

  USER_ROLE_CHANGED: 'An administrator changed your account role. Refresh access to update your workspace.',
  EVENT_ORGANIZER_ADDED: 'You were added as a co-organizer. Open My events in the organizer workspace to manage this game.',
  EVENT_ORGANIZER_REMOVED: 'You were removed as a co-organizer. Your player bookings are unchanged.',
  EVENT_INVITATION: 'You are invited to this game. Open My games to review the price and accept or decline.',
  ORGANIZER_BOOKED_PLAYER: 'An organizer booked a seat for you. Check My games for confirmed/waitlisted status, price and cancellation. Draft bookings are provisional until publication.',
  ORGANIZER_REQUEST: 'A player requested organizer access. Review their pending request on the Users page.',
  ORGANIZER_ACCESS_GRANTED: 'An administrator granted organizer access. Refresh your profile to open the organizer workspace.',
  ORGANIZER_REQUEST_GRANTED: 'An administrator granted organizer access. Refresh your profile to open the organizer workspace.',
  ORGANIZER_REQUEST_CLEARED: 'An administrator cleared your organizer request. You can submit a new request from My profile.',
  STRIKE_ISSUED: 'An organizer recorded a reviewed strike on your account. View My games for the affected player or guest seat.',
  WAITLIST_PROMOTED: 'Your whole party now has confirmed places.',
  BOOKING_REMOVED: 'The organizer removed your booking.',
  EVENT_CHANGED: 'Event details changed. Review the latest details in My games.',
  EVENT_RETURNED_TO_DRAFT: 'The organizer returned this event to draft while reviewing it. Your booking is retained as provisional. New joins are paused until the event is published again. Check My games for updates.',
  EVENT_PUBLISHED: 'This event is published and open for joining. Your existing booking is retained. Check My games for the latest details and booking status.',
  EVENT_CANCELLED: 'The event was cancelled. Your booking has been cancelled.',
  EVENT_REMINDER: 'Your game starts within 24 hours. Check the time and location in My games.'
};
@Injectable()
export class NotificationsService {
  constructor(@Inject(Database) private readonly db: Database) {}
  private async reviewReminders(userId: string, role: string | undefined, now: Date) {
    const keys: string[] = [], eventIds = new Set<string>();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    if (role === 'ORGANIZER' || role === 'ADMINISTRATOR') {
      const pending = await this.db.event.findMany({ where: { deletedAt: null, status: { in: ['PUBLISHED', 'COMPLETED'] }, endsAt: { lte: now }, auditLogs: { none: { action: 'EVENT_REVIEW_COMPLETED' } }, ...(role === 'ADMINISTRATOR' ? { OR: [managedEvents(userId), { endsAt: { lte: weekAgo } }] } : managedEvents(userId)) }, select: { id: true } });
      for (const candidate of pending) await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${candidate.id}::uuid FOR UPDATE`;
        const event = await tx.event.findUnique({ where: { id: candidate.id }, include: { auditLogs: { where: { action: 'EVENT_REVIEW_COMPLETED' }, select: { id: true }, take: 1 } } });
        if (!event || event.deletedAt || !['PUBLISHED', 'COMPLETED'].includes(event.status) || event.endsAt > now || event.auditLogs.length) return;
        const stale = event.endsAt <= weekAgo;
        if (!managesEvent(event, userId) && !(role === 'ADMINISTRATOR' && stale)) return;
        const kind = stale ? 'STALE_EVENT_REVIEW_REMINDER' : 'ORGANIZER_REVIEW_REMINDER';
        const dedupeKey = `event-review:${kind}:${event.id}:${event.endsAt.getTime()}:${userId}`;
        keys.push(dedupeKey); eventIds.add(event.id);
        await tx.notification.upsert({ where: { dedupeKey }, update: {}, create: { userId, kind, dedupeKey, payload: { eventId: event.id, title: `${stale ? 'Review overdue' : 'Game ready for review'}: ${event.title}` } } });
      });
    }
    await this.db.notification.updateMany({ where: { userId, kind: { in: ['ORGANIZER_REVIEW_REMINDER', 'STALE_EVENT_REVIEW_REMINDER'] }, readAt: null, dedupeKey: { notIn: keys } }, data: { readAt: now } });
    return eventIds;
  }
  // In-app reminders are generated on inbox refresh. No worker or external delivery provider is needed.
  async inbox(userId: string) {
    await refreshPaymentStrikes(this.db, [userId]);
    const now = new Date();
    const overdue = { userId, status: 'CONFIRMED' as const, event: { deletedAt: null, status: { in: ['PUBLISHED', 'COMPLETED'] as ('PUBLISHED' | 'COMPLETED')[] }, endsAt: { lt: new Date(now.getTime() - paymentGraceMs) } }, payment: { amountCents: { gt: 0 }, status: { not: 'VOID' as const }, playerPaid: null } };
    const pending = await this.db.signup.findMany({ where: overdue, select: { eventId: true, bookingId: true }, distinct: ['bookingId'] });
    const reminderKeys: string[] = [];
    for (const booking of pending) await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${booking.eventId}::uuid FOR UPDATE`;
      const seat = await tx.signup.findFirst({ where: { ...overdue, bookingId: booking.bookingId }, include: { event: true } });
      if (!seat) return;
      const dedupeKey = `payment-review:${booking.bookingId}`; reminderKeys.push(dedupeKey);
      await tx.notification.upsert({ where: { dedupeKey }, update: {}, create: { userId, kind: 'PAYMENT_REVIEW_REMINDER', dedupeKey, payload: { eventId: seat.eventId, bookingId: seat.bookingId, title: `Please review payment: ${seat.event.title}` } } });
    });
    await this.db.notification.updateMany({ where: { userId, kind: 'PAYMENT_REVIEW_REMINDER', readAt: null, dedupeKey: { notIn: reminderKeys } }, data: { readAt: now } });
    // Also cover administrators appointed after a request was submitted.
    const viewer = await this.db.user.findUnique({ where: { id: userId }, select: { role: true } });
    const reviewEvents = await this.reviewReminders(userId, viewer?.role, now);
    if (viewer?.role === 'ADMINISTRATOR') {
      const pending = await this.db.organizerRequest.findMany({ where: { status: 'PENDING' }, select: { id: true, userId: true } });
      for (const candidate of pending) await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${candidate.userId}::uuid FOR UPDATE`;
        const request = await tx.organizerRequest.findUnique({ where: { id: candidate.id }, include: { user: { select: { displayName: true } } } });
        if (request?.status !== 'PENDING') return;
        const dedupeKey = `organizer-request:${request.id}:${userId}`;
        await tx.notification.upsert({ where: { dedupeKey }, update: {}, create: { userId, kind: 'ORGANIZER_REQUEST', dedupeKey, payload: { requestId: request.id, requesterId: request.userId, title: `${request.user.displayName} requested organizer access` } } });
      });
    }
    const bookings = await this.db.signup.findMany({ where: { userId, guestNumber: 0, status: 'CONFIRMED', event: { deletedAt: null, status: 'PUBLISHED', startsAt: { gt: now, lte: new Date(now.getTime() + 86400000) } } }, select: { eventId: true, bookingId: true } });
    for (const booking of bookings) await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${booking.eventId}::uuid FOR UPDATE`;
      const current = await tx.signup.findFirst({ where: { bookingId: booking.bookingId, userId, guestNumber: 0, status: 'CONFIRMED', event: { deletedAt: null, status: 'PUBLISHED', startsAt: { gt: new Date(), lte: new Date(Date.now() + 86400000) } } }, include: { event: true } });
      if (!current) return;
      const dedupeKey = `reminder:${booking.bookingId}:${current.event.startsAt.getTime()}`;
      await tx.notification.upsert({ where: { dedupeKey }, update: {}, create: { userId, kind: 'EVENT_REMINDER', dedupeKey, payload: { eventId: booking.eventId, title: current.event.title } } });
    });
    const where = { userId, availableAt: { lte: new Date() }, status: { in: ['PENDING', 'SENT'] as ('PENDING' | 'SENT')[] } };
    const [rows, unread] = await this.db.$transaction([
      this.db.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 }),
      this.db.notification.count({ where: { ...where, readAt: null } })
    ]);
    const ids = rows.map(row => (row.payload as { eventId?: string }).eventId).filter((id): id is string => !!id && /^[0-9a-f-]{36}$/i.test(id));
    const events = await this.db.event.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } });
    return { unread, items: rows.map(row => {
      const payload = row.payload as { eventId?: string; bookingId?: string; title?: string; note?: string };
      return { id: row.id, eventId: payload.eventId ?? null, bookingId: payload.bookingId ?? null, kind: row.kind, reviewAvailable: ['ORGANIZER_REVIEW_REMINDER', 'STALE_EVENT_REVIEW_REMINDER'].includes(row.kind) && !!payload.eventId && reviewEvents.has(payload.eventId), title: payload.title ?? events.find(e => e.id === payload.eventId)?.title ?? 'Game update', message: descriptions[row.kind] ?? 'There is an update about your game.', createdAt: row.createdAt, readAt: row.readAt };
    }) };
  }
  async read(userId: string, id?: string) {
    if (id) uuid(id);
    const result = await this.db.notification.updateMany({ where: { userId, ...(id ? { id } : {}), availableAt: { lte: new Date() }, status: { in: ['PENDING', 'SENT'] }, readAt: null }, data: { readAt: new Date() } });
    if (id && !result.count && !await this.db.notification.findFirst({ where: { id, userId, readAt: { not: null } } })) throw new NotFoundException('Notification not found.');
    return { updated: result.count };
  }
}
@Controller('api/me/notifications') @UseGuards(FirebaseGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly service: NotificationsService) {}
  @Get() inbox(@Req() req: AuthRequest) { return this.service.inbox(req.user.id); }
  @Post('read-all') readAll(@Req() req: AuthRequest) { return this.service.read(req.user.id); }
  @Post(':id/read') read(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.read(req.user.id, id); }
}
