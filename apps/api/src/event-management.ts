import { ConflictException, Controller, Inject, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthRequest, FirebaseGuard, OrganizerGuard } from './auth';
import { Database } from './database';
import { uuid } from './validation';

@Injectable()
export class EventManagementService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async transition(actorId: string, id: string, action: 'cancel' | 'complete', administrator = false) {
    uuid(id);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const event = await tx.event.findUnique({ where: { id } });
      if (!event || event.deletedAt || (!administrator && event.organizerId !== actorId)) throw new NotFoundException('Event not found.');
      const target = action === 'cancel' ? 'CANCELLED' : 'COMPLETED';
      if (event.status === target) return event;
      const now = new Date();
      if (action === 'cancel' && (!['DRAFT', 'PUBLISHED'].includes(event.status) || event.startsAt <= now)) throw new ConflictException('Only future draft or published events can be cancelled.');
      if (action === 'complete' && (event.status !== 'PUBLISHED' || event.endsAt > now)) throw new ConflictException('Only published events that have ended can be completed.');
      if (action === 'cancel') {
        const hosts = await tx.signup.findMany({ where: { eventId: id, guestNumber: 0, status: { in: ['CONFIRMED', 'WAITLISTED'] } }, select: { userId: true } });
        await tx.signup.updateMany({ where: { eventId: id, status: { in: ['CONFIRMED', 'WAITLISTED'] } }, data: { status: 'CANCELLED', cancellationSource: 'EVENT', teamNumber: null, cancelledAt: now, lateCancellation: false } });
        await tx.paymentObligation.updateMany({ where: { signup: { eventId: id } }, data: { status: 'VOID' } });
        for (const host of hosts) await tx.notification.create({ data: { userId: host.userId, kind: 'EVENT_CANCELLED', dedupeKey: `cancelled:${id}:${host.userId}`, payload: { eventId: id, title: event.title } } });
      }
      const updated = await tx.event.update({ where: { id }, data: { status: target } });
      await tx.auditLog.create({ data: { actorId, eventId: id, action: `EVENT_${target}`, details: { previousStatus: event.status } } });
      return updated;
    }, { maxWait: 10000, timeout: 15000 });
  }
}
@Controller('api/organizer/events')
@UseGuards(FirebaseGuard, OrganizerGuard)
export class EventManagementController {
  constructor(@Inject(EventManagementService) private readonly service: EventManagementService) {}
  @Post(':id/cancel') cancel(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.transition(req.user.id, id, 'cancel', req.user.role === 'ADMINISTRATOR'); }
  @Post(':id/complete') complete(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.transition(req.user.id, id, 'complete', req.user.role === 'ADMINISTRATOR'); }
}
