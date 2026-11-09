import { Event, Prisma } from '@prisma/client';
import { playerSelections } from './event-options';
import { managedEvents } from './event-organizers';
import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthRequest, FirebaseGuard, OrganizerGuard } from './auth';
import { Database } from './database';
import { costAcknowledgment, SignupsService } from './signups';
import { integer, object, uuid } from './validation';
import { refreshPaymentStrikes } from './strike-policy';
import { appearance, appearanceSelect } from './profile-fields';
import { notifyInvitations } from './event-invitation-notices';
@Injectable()
export class EventInvitationsService {
  constructor(@Inject(Database) private readonly db: Database, @Inject(SignupsService) private readonly signups: SignupsService) {}
  async search(search: string, minimumSkill?: string) {
    const minimum = minimumSkill === undefined || minimumSkill === '' ? null : integer(Number(minimumSkill), 'Minimum skill', 1, 5);
    if (typeof search !== 'string' || (!minimum && search.trim().length < 2) || search.length > 80) throw new BadRequestException('Enter 2 to 80 characters to find existing players.');
    const users = await this.db.user.findMany({ where: { AND: [ ...(search.trim() ? [{ OR: [{ displayName: { contains: search.trim(), mode: 'insensitive' as const } }, { nickname: { contains: search.trim(), mode: 'insensitive' as const } }] }] : []), ...(minimum ? [{ OR: [{ adminSkillLevel: { gte: minimum } }, { adminSkillLevel: null, skillLevel: { gte: minimum } }] }] : []) ] }, select: { id: true, ...appearanceSelect, skillLevel: true, adminSkillLevel: true }, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], take: 20 });
    return users.map(user => ({ id: user.id, ...appearance(user), accountName: user.displayName, skillLevel: user.skillLevel, adminSkillLevel: user.adminSkillLevel }));
  }
  async mine(userId: string) {
    const invitations = await this.db.eventInvitation.findMany({ where: { userId, status: 'PENDING', event: { deletedAt: null, status: 'PUBLISHED', startsAt: { gt: new Date() } } }, select: { id: true, event: { select: { id: true, isPrivate: true, privateInviteToken: true, title: true, startsAt: true, priceCents: true, location: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 });
    return invitations.map(({ event: { privateInviteToken, ...event }, ...invitation }) => ({ ...invitation, event, privateGameUrl: event.isPrivate ? `/private-game/${event.id}/${privateInviteToken}` : null }));
  }
  async addPlayer(actorId: string, eventId: string, value: unknown, administrator = false) {
    const input = object(value, ['userId', 'mode', 'expectedPriceCents']);
    const result = await this.addPlayers(actorId, eventId, { players: [{ userId: input.userId, mode: input.mode }], ...(input.expectedPriceCents !== undefined ? { expectedPriceCents: input.expectedPriceCents } : {}) }, administrator);
    return result.items[0];
  }
  async addPlayers(actorId: string, eventId: string, value: unknown, administrator = false) {
    uuid(eventId); const input = object(value, ['players', 'expectedPriceCents']); const players = playerSelections(input.players);
    if (!players.length) throw new BadRequestException('Select at least one player.');
    const booked = players.filter(player => player.mode === 'BOOK').map(player => player.userId);
    const price = booked.length ? integer(input.expectedPriceCents, 'Expected price', 0, 2147483647) : 0;
    const where = { id: eventId, deletedAt: null, ...(administrator ? {} : managedEvents(actorId)) };
    if (!await this.db.event.findFirst({ where })) throw new NotFoundException('Event not found.');
    if (booked.length) await refreshPaymentStrikes(this.db, booked);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
      const event = await tx.event.findFirst({ where });
      if (!event) throw new NotFoundException('Event not found.');
      if (!['DRAFT', 'PUBLISHED'].includes(event.status) || event.startsAt <= new Date()) throw new ConflictException('Players can only be added to future draft or published events.');
      if (await tx.user.count({ where: { id: { in: players.map(player => player.userId) } } }) !== players.length) throw new NotFoundException('Player not found.');
      for (const userId of [...booked].sort()) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const items = [];
      for (const player of players) items.push({ userId: player.userId, ...await this.addWithin(tx, event, actorId, player.userId, player.mode, price) });
      return { items };
    }, { maxWait: 10000, timeout: 30000 });
  }
  private async addWithin(tx: Prisma.TransactionClient, event: Event, actorId: string, userId: string, mode: 'INVITE' | 'BOOK', price: number) {
    const eventId = event.id;
    const current = await tx.signup.findFirst({ where: { eventId, userId, guestNumber: 0, status: { in: ['CONFIRMED', 'WAITLISTED'] } } });
    if (current) {
      if (mode === 'INVITE') throw new ConflictException('This player already has an active booking.');
      return { mode, status: current.status, bookingId: current.bookingId, draft: event.status === 'DRAFT', alreadyAdded: true };
    }
    if (mode === 'INVITE') {
      const previous = await tx.eventInvitation.findUnique({ where: { eventId_userId: { eventId, userId } } });
      if (previous?.status === 'PENDING') return { mode, status: 'PENDING', draft: event.status === 'DRAFT', alreadyAdded: true };
      const invitation = await tx.eventInvitation.upsert({ where: { eventId_userId: { eventId, userId } }, create: { eventId, userId }, update: { status: 'PENDING', bookingId: null } });
      // A draft re-invitation stays quiet until publication.
      if (event.status === 'DRAFT') await tx.notification.updateMany({ where: { dedupeKey: `event-invitation:${invitation.id}`, readAt: null }, data: { readAt: new Date() } });
      await notifyInvitations(tx, event, userId);
      await tx.auditLog.create({ data: { actorId, eventId, action: 'ORGANIZER_INVITED_PLAYER', details: { userId, invitationId: invitation.id, draft: event.status === 'DRAFT' } } });
      return { mode, status: 'PENDING', draft: event.status === 'DRAFT', alreadyAdded: false };
    }
    if (event.priceCents !== price) throw new ConflictException('The event price changed. Refresh the event and review the current price before booking.');
    // The event owner/admin authorizes this private booking; the player did not submit an invite key or consent.
    const seats = await this.signups.bookParty(tx, event, userId, [], price, undefined, event.privateInviteToken ?? undefined);
    await tx.eventInvitation.updateMany({ where: { eventId, userId, status: 'PENDING' }, data: { status: 'ACCEPTED', bookingId: seats[0].bookingId } });
    await tx.notification.updateMany({ where: { userId, kind: 'EVENT_INVITATION', payload: { path: ['eventId'], equals: eventId }, readAt: null }, data: { readAt: new Date() } });
    await tx.auditLog.create({ data: { actorId, eventId, action: 'ORGANIZER_BOOKED_PLAYER', details: { userId, bookingId: seats[0].bookingId, priceCents: price, status: seats[0].status, playerConfirmation: false } } });
    await tx.notification.create({ data: { userId, kind: 'ORGANIZER_BOOKED_PLAYER', dedupeKey: `added:${seats[0].bookingId}`, payload: { eventId, title: event.title, draft: event.status === 'DRAFT' } } });
    return { mode, status: seats[0].status, bookingId: seats[0].bookingId, draft: event.status === 'DRAFT', alreadyAdded: false };
  }
  private async bulkCandidates(tx: Prisma.TransactionClient, event: Event, actorId: string, minimum: number) {
    const users = await tx.user.findMany({ where: { id: { notIn: [actorId, event.organizerId, ...event.coOrganizerIds] }, OR: [{ adminSkillLevel: { gte: minimum } }, { adminSkillLevel: null, skillLevel: { gte: minimum } }], signups: { none: { eventId: event.id, status: { in: ['CONFIRMED', 'WAITLISTED'] } } }, eventInvitations: { none: { eventId: event.id } } }, select: { id: true }, orderBy: { id: 'asc' }, take: 1001 });
    if (users.length > 1000) throw new ConflictException('More than 1000 players match. Choose a higher minimum skill.');
    return users.map(user => user.id);
  }
  async bulkInvite(actorId: string, eventId: string, value: unknown, administrator = false, preview = false) {
    uuid(eventId); const input = object(value, preview ? ['minimumSkill'] : ['previewId', 'confirm']);
    const minimum = preview ? integer(input.minimumSkill, 'Minimum skill', 1, 5) : 1;
    if (!preview) { uuid(typeof input.previewId === 'string' ? input.previewId : ''); if (input.confirm !== true) throw new BadRequestException('Confirm the bulk invitation request.'); }
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
      const event = await tx.event.findFirst({ where: { id: eventId, deletedAt: null, ...(administrator ? {} : managedEvents(actorId)) } });
      if (!event) throw new NotFoundException('Event not found.');
      if (!['DRAFT', 'PUBLISHED'].includes(event.status) || event.startsAt <= new Date()) throw new ConflictException('Bulk invitations require a future draft or published event.');
      if (preview) {
        const userIds = await this.bulkCandidates(tx, event, actorId, minimum);
        const audit = await tx.auditLog.create({ data: { actorId, eventId, action: 'BULK_INVITE_PREVIEWED', details: { minimumSkill: minimum, userIds } } });
        return { previewId: audit.id, minimumSkill: minimum, count: userIds.length, draft: event.status === 'DRAFT' };
      }
      const prior = await tx.auditLog.findFirst({ where: { actorId, eventId, action: 'BULK_INVITE_SENT', details: { path: ['previewId'], equals: input.previewId as string } } });
      if (prior) return prior.details as { count: number; draft: boolean };
      const audit = await tx.auditLog.findFirst({ where: { id: input.previewId as string, actorId, eventId, action: 'BULK_INVITE_PREVIEWED', createdAt: { gt: new Date(Date.now() - 600000) } } });
      if (!audit) throw new ConflictException('Bulk preview expired. Confirm the number again.');
      const snapshot = audit.details as { minimumSkill: number; userIds: string[] };
      const ids = await this.bulkCandidates(tx, event, actorId, snapshot.minimumSkill);
      if (JSON.stringify(ids) !== JSON.stringify(snapshot.userIds)) throw new ConflictException('Matching players changed. Confirm the number again.');
      if (ids.length) { await tx.eventInvitation.createMany({ data: ids.map(userId => ({ eventId, userId })) }); await notifyInvitations(tx, event, ids); }
      const result = { count: ids.length, draft: event.status === 'DRAFT' };
      await tx.auditLog.create({ data: { actorId, eventId, action: 'BULK_INVITE_SENT', details: { previewId: input.previewId as string, minimumSkill: snapshot.minimumSkill, ...result } } });
      return result;
    }, { maxWait: 10000, timeout: 30000 });
  }
  async respond(userId: string, id: string, action: 'accept' | 'decline', value?: unknown) {
    uuid(id);
    const input = action === 'accept' ? object(value, ['expectedPriceCents', 'costAcknowledged', 'privateInviteToken']) : {};
    const price = action === 'accept' ? integer(input.expectedPriceCents, 'Expected price', 0, 2147483647) : 0;
    if (action === 'accept') costAcknowledgment(input.costAcknowledged, price);
    if (action === 'accept') await refreshPaymentStrikes(this.db, [userId]);
    return this.db.$transaction(async tx => {
      const first = await tx.eventInvitation.findFirst({ where: { id, userId } });
      if (!first) throw new NotFoundException('Invitation not found.');
      await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${first.eventId}::uuid FOR UPDATE`;
      const invitation = await tx.eventInvitation.findUniqueOrThrow({ where: { id } });
      const target = action === 'accept' ? 'ACCEPTED' : 'DECLINED';
      if (invitation.status === target) return invitation;
      if (invitation.status !== 'PENDING') throw new ConflictException('This invitation has already been answered.');
      const event = await tx.event.findUniqueOrThrow({ where: { id: invitation.eventId } });
      let bookingId: string | null = null;
      if (action === 'accept') {
        if (event.deletedAt || event.status !== 'PUBLISHED' || event.startsAt <= new Date()) throw new ConflictException('This event is no longer open for registration.');
        const seats = await this.signups.bookParty(tx, event, userId, [], price, 'PLAYER_INVITATION', typeof input.privateInviteToken === 'string' ? input.privateInviteToken : undefined); bookingId = seats[0].bookingId;
      }
      const updated = await tx.eventInvitation.update({ where: { id }, data: { status: target, bookingId } });
      await tx.notification.updateMany({ where: { userId, dedupeKey: `event-invitation:${id}`, readAt: null }, data: { readAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: userId, eventId: event.id, action: `INVITATION_${target}`, details: { invitationId: id, bookingId, ...(action === 'accept' ? { acceptedPriceCents: price } : {}) } } });
      return updated;
    }, { maxWait: 10000, timeout: 15000 });
  }
}
@Controller('api') @UseGuards(FirebaseGuard)
export class EventInvitationsController {
  constructor(@Inject(EventInvitationsService) private readonly service: EventInvitationsService) {}
  @Get('organizer/players') @UseGuards(OrganizerGuard) search(@Query('search') search = '', @Query('minimumSkill') minimumSkill?: string) { return this.service.search(search, minimumSkill); }
  @Post('organizer/events/:id/players/batch') @UseGuards(OrganizerGuard) addPlayers(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) { return this.service.addPlayers(req.user.id, id, body, req.user.role === 'ADMINISTRATOR'); }
  @Post('organizer/events/:id/players/bulk-preview') @UseGuards(OrganizerGuard) bulkPreview(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) { return this.service.bulkInvite(req.user.id, id, body, req.user.role === 'ADMINISTRATOR', true); }
  @Post('organizer/events/:id/players/bulk-invite') @UseGuards(OrganizerGuard) bulkSend(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) { return this.service.bulkInvite(req.user.id, id, body, req.user.role === 'ADMINISTRATOR'); }
  @Post('organizer/events/:id/players') @UseGuards(OrganizerGuard) add(@Req() req: AuthRequest, @Param('id') id: string, @Body() value: unknown) { return this.service.addPlayer(req.user.id, id, value, req.user.role === 'ADMINISTRATOR'); }
  @Get('me/event-invitations') mine(@Req() req: AuthRequest) { return this.service.mine(req.user.id); }
  @Post('me/event-invitations/:id/accept') accept(@Req() req: AuthRequest, @Param('id') id: string, @Body() value: unknown) { return this.service.respond(req.user.id, id, 'accept', value); }
  @Post('me/event-invitations/:id/decline') decline(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.respond(req.user.id, id, 'decline'); }
}
