import { managesEvent, coOrganizerInput, validateOrganizers, notifyOrganizerChanges } from './event-organizers';
import { BadRequestException, Body, ConflictException, Controller, Delete, Inject, Injectable, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AdministratorGuard, AuthRequest, FirebaseGuard, OrganizerGuard } from './auth';
import { Database } from './database';
import { instant, integer, object, text, uuid } from './validation';
import { randomUUID } from 'node:crypto';
import { eventOptionsInput } from './event-options';
import { eventGuidanceInput } from './event-guidance';
import { SignupsService } from './signups';
@Injectable()
export class AdministrationService {
  constructor(@Inject(Database) private readonly db: Database, @Inject(SignupsService) private readonly signups: SignupsService) {}
  async edit(actorId: string, id: string, value: unknown, administrator = false) {
    uuid(id);
    const b = object(value, ['title', 'description', 'locationId', 'startsAt', 'endsAt', 'capacity', 'priceCents', 'maxGuestsPerUser', 'cancellationCutoffHours', 'bibsProvided', 'bibCount', 'shirtColors', 'shirtColorCount', 'minPlayers', 'teamCount', 'teamBalancingEnabled', 'organizerContactEmail', 'organizerContactPhone', 'contactCallAllowed', 'contactTextAllowed', 'status', 'coOrganizerIds']);
    if (b.status !== undefined && b.status !== 'DRAFT') throw new BadRequestException('Only DRAFT can be selected while editing. Use Publish event to publish a draft.');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const event = await tx.event.findUnique({ where: { id } });
      if (!event || event.deletedAt || (!administrator && !managesEvent(event, actorId))) throw new NotFoundException('Event not found.');
      if (['CANCELLED', 'COMPLETED'].includes(event.status)) throw new ConflictException('Cancelled or completed events cannot be edited.');
      const returningToDraft = event.status === 'PUBLISHED' && b.status === 'DRAFT';
      if (returningToDraft && event.startsAt <= new Date()) throw new ConflictException('Only future published events can be returned to draft.');
      const startsAt = b.startsAt === undefined ? event.startsAt : instant(b.startsAt, 'Start');
      const endsAt = b.endsAt === undefined ? event.endsAt : instant(b.endsAt, 'End');
      if (endsAt <= startsAt) throw new BadRequestException('End must follow start.');
      if (event.startsAt <= new Date() && (startsAt.getTime() !== event.startsAt.getTime() || endsAt.getTime() !== event.endsAt.getTime())) throw new ConflictException('Times of started events cannot be changed.');
      if (event.startsAt > new Date() && startsAt <= new Date()) throw new BadRequestException('Choose a future start.');
      const capacity = b.capacity === undefined ? event.capacity : integer(b.capacity, 'Capacity', 1, 1000);
      if (capacity < await tx.signup.count({ where: { eventId: id, status: 'CONFIRMED' } })) throw new ConflictException('Capacity cannot be lower than confirmed seats.');
      const maxGuestsPerUser = b.maxGuestsPerUser === undefined ? event.maxGuestsPerUser : integer(b.maxGuestsPerUser, 'Guests', 0, 20);
      if (maxGuestsPerUser >= capacity) throw new BadRequestException('Guest allowance must be smaller than capacity.');
      const locationId = b.locationId === undefined ? event.locationId : uuid(text(b.locationId, 'Location'));
      if (!await tx.location.findUnique({ where: { id: locationId } })) throw new BadRequestException('Location does not exist.');
      const coOrganizerIds = coOrganizerInput(b.coOrganizerIds, event.coOrganizerIds);
      if (b.coOrganizerIds !== undefined) await validateOrganizers(tx, coOrganizerIds, event.organizerId);
      const data = {
        coOrganizerIds,
        ...(b.status === 'DRAFT' ? { status: 'DRAFT' as const } : {}),
        ...eventGuidanceInput(b, capacity, event), ...eventOptionsInput(b, event),
        title: b.title === undefined ? event.title : text(b.title, 'Title'), description: b.description === undefined ? event.description : b.description === '' || b.description === null ? null : text(b.description, 'Description', 4000),
        locationId, startsAt, endsAt, capacity, maxGuestsPerUser,
        priceCents: b.priceCents === undefined ? event.priceCents : integer(b.priceCents, 'Price', 0, 2147483647),
        cancellationCutoffHours: b.cancellationCutoffHours === undefined ? event.cancellationCutoffHours : integer(b.cancellationCutoffHours, 'Cutoff', 0, 8760)
      };
      if (Object.entries(data).every(([key, value]) => {
        const previous = event[key as keyof typeof event];
        if (Array.isArray(value) && Array.isArray(previous)) return JSON.stringify(value) === JSON.stringify(previous);
        return value instanceof Date && previous instanceof Date ? value.getTime() === previous.getTime() : value === previous;
      })) return event;
      const revision = randomUUID();
      const updated = await tx.event.update({ where: { id }, data });
      await notifyOrganizerChanges(tx, updated, event.coOrganizerIds);
      await tx.signup.updateMany({ where: { eventId: id, teamNumber: { gt: updated.teamCount } }, data: { teamNumber: null } });
      if (updated.status === 'PUBLISHED' && updated.startsAt > new Date() && capacity > event.capacity) await this.signups.promote(tx, updated);
      await tx.paymentObligation.updateMany({ where: { signup: { eventId: id }, status: 'UNPAID' }, data: { dueAt: endsAt } });
      const hosts = await tx.signup.findMany({ where: { eventId: id, guestNumber: 0, status: { in: ['CONFIRMED', 'WAITLISTED'] } }, select: { userId: true } });
      for (const host of hosts) await tx.notification.create({ data: { userId: host.userId, kind: returningToDraft ? 'EVENT_RETURNED_TO_DRAFT' : 'EVENT_CHANGED', dedupeKey: `edit:${id}:${revision}:${host.userId}`, payload: { eventId: id, title: updated.title } } });
      await tx.auditLog.create({ data: { actorId, eventId: id, action: administrator ? 'ADMIN_EVENT_EDITED' : 'EVENT_EDITED', details: { before: JSON.parse(JSON.stringify({ ...event, privateInviteToken: undefined })), after: JSON.parse(JSON.stringify(data)) } } });
      if (returningToDraft) await tx.auditLog.create({ data: { actorId, eventId: id, action: 'EVENT_RETURNED_TO_DRAFT', details: { previousStatus: event.status, bookingsRetained: true } } });
      return updated;
    }, { maxWait: 10000, timeout: 15000 });
  }
  async remove(actorId: string, id: string) {
    uuid(id);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const event = await tx.event.findUnique({ where: { id } });
      if (!event) throw new NotFoundException('Event not found.');
      if (event.deletedAt) return { deleted: true };
      if (event.startsAt > new Date()) {
        const hosts = await tx.signup.findMany({ where: { eventId: id, guestNumber: 0, status: { in: ['CONFIRMED', 'WAITLISTED'] } } });
        await tx.signup.updateMany({ where: { eventId: id, status: { in: ['CONFIRMED', 'WAITLISTED'] } }, data: { status: 'CANCELLED', cancellationSource: 'EVENT', teamNumber: null, cancelledAt: new Date(), lateCancellation: false } });
        await tx.paymentObligation.updateMany({ where: { signup: { eventId: id }, status: { in: ['UNPAID', 'NOT_REQUIRED'] } }, data: { status: 'VOID' } });
        for (const host of hosts) await tx.notification.create({ data: { userId: host.userId, kind: 'EVENT_CANCELLED', dedupeKey: `deleted:${id}:${host.userId}`, payload: { eventId: id, title: event.title } } });
      }
      await tx.event.update({ where: { id }, data: { deletedAt: new Date(), ...(event.startsAt > new Date() ? { status: 'CANCELLED' as const } : {}) } });
      await tx.auditLog.create({ data: { actorId, eventId: id, action: 'ADMIN_EVENT_DELETED', details: { retainedHistory: true } } });
      return { deleted: true };
    }, { maxWait: 10000, timeout: 15000 });
  }
}
@Controller('api/admin/events') @UseGuards(FirebaseGuard, AdministratorGuard)
export class AdministrationController {
  constructor(@Inject(AdministrationService) private readonly service: AdministrationService) {}
  @Patch(':id') edit(@Req() req: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.service.edit(req.user.id, id, b, true); }
  @Delete(':id') remove(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.remove(req.user.id, id); }
}

@Controller('api/organizer/events') @UseGuards(FirebaseGuard, OrganizerGuard)
export class OrganizerEventEditingController {
  constructor(@Inject(AdministrationService) private readonly service: AdministrationService) {}
  @Patch(':id') edit(@Req() req: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.service.edit(req.user.id, id, b, req.user.role === 'ADMINISTRATOR'); }
}
