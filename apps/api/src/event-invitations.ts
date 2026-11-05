import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthRequest, FirebaseGuard, OrganizerGuard } from './auth';
import { Database } from './database';
import { costAcknowledgment, SignupsService } from './signups';
import { integer, object, uuid } from './validation';
import { refreshPaymentStrikes } from './strike-policy';
import { appearance, appearanceSelect } from './profile-fields';
@Injectable()
export class EventInvitationsService {
  constructor(@Inject(Database) private readonly db: Database, @Inject(SignupsService) private readonly signups: SignupsService) {}
  async search(search: string) {
    if (typeof search !== 'string' || search.trim().length < 2 || search.length > 80) throw new BadRequestException('Enter 2 to 80 characters to find existing players.');
    const users = await this.db.user.findMany({ where: { OR: [{ displayName: { contains: search.trim(), mode: 'insensitive' } }, { nickname: { contains: search.trim(), mode: 'insensitive' } }] }, select: { id: true, ...appearanceSelect, skillLevel: true, adminSkillLevel: true }, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], take: 20 });
    return users.map(user => ({ id: user.id, ...appearance(user), accountName: user.displayName, skillLevel: user.skillLevel, adminSkillLevel: user.adminSkillLevel }));
  }
  async mine(userId: string) {
    const invitations = await this.db.eventInvitation.findMany({ where: { userId, status: 'PENDING', event: { deletedAt: null, status: 'PUBLISHED', startsAt: { gt: new Date() } } }, select: { id: true, event: { select: { id: true, isPrivate: true, privateInviteToken: true, title: true, startsAt: true, priceCents: true, location: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 });
    return invitations.map(({ event: { privateInviteToken, ...event }, ...invitation }) => ({ ...invitation, event, privateGameUrl: event.isPrivate ? `/private-game/${event.id}/${privateInviteToken}` : null }));
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
  @Get('organizer/players') @UseGuards(OrganizerGuard) search(@Query('search') search = '') { return this.service.search(search); }
  @Get('me/event-invitations') mine(@Req() req: AuthRequest) { return this.service.mine(req.user.id); }
  @Post('me/event-invitations/:id/accept') accept(@Req() req: AuthRequest, @Param('id') id: string, @Body() value: unknown) { return this.service.respond(req.user.id, id, 'accept', value); }
  @Post('me/event-invitations/:id/decline') decline(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.respond(req.user.id, id, 'decline'); }
}
