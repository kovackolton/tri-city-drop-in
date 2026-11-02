import { Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthRequest, FirebaseGuard } from './auth';
import { Database } from './database';
import { uuid } from './validation';

const descriptions: Record<string, string> = {
  WAITLIST_PROMOTED: 'Your whole party now has confirmed places.',
  BOOKING_REMOVED: 'The organizer removed your booking.',
  EVENT_CHANGED: 'Event details changed. Review the latest details in My games.',
  EVENT_CANCELLED: 'The event was cancelled. Your booking has been cancelled.',
  EVENT_REMINDER: 'Your game starts within 24 hours. Check the time and location in My games.'
};
@Injectable()
export class NotificationsService {
  constructor(@Inject(Database) private readonly db: Database) {}
  // In-app reminders are generated on inbox refresh. No worker or external delivery provider is needed.
  async inbox(userId: string) {
    const now = new Date();
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
      const payload = row.payload as { eventId?: string; title?: string };
      return { id: row.id, kind: row.kind, title: payload.title ?? events.find(e => e.id === payload.eventId)?.title ?? 'Game update', message: descriptions[row.kind] ?? 'There is an update about your game.', createdAt: row.createdAt, readAt: row.readAt };
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
