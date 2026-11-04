import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Event, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthRequest, FirebaseGuard, OrganizerGuard } from './auth';
import { appearance, appearanceSelect } from './profile-fields';
import { Database } from './database';
import { waiverVersion, waiverHash } from './waiver';
import { currentStrikes, refreshPaymentStrikes, strikeLimit } from './strike-policy';
import { integer, object, text, uuid } from './validation';

export function costAcknowledgment(value: unknown, price: number) {
  if (value !== undefined && typeof value !== 'boolean') throw new BadRequestException('Cost acknowledgment must be a boolean.');
  if (price > 0 && value !== true) throw new BadRequestException('Acknowledge the event cost before joining.');
}
export function signupInput(value: unknown) {
  const b = object(value, ['guests', 'expectedPriceCents', 'guestPaymentAcknowledged', 'costAcknowledged']);
  if (!Array.isArray(b.guests) || b.guests.length > 20) throw new BadRequestException('Provide up to 20 guest names.');
  if (b.guests.length && b.guestPaymentAcknowledged !== true) throw new BadRequestException('Acknowledge responsibility for guest payments before booking guests.');
  if (b.guestPaymentAcknowledged !== undefined && typeof b.guestPaymentAcknowledged !== 'boolean') throw new BadRequestException('Guest payment acknowledgment must be a boolean.');
  const price = integer(b.expectedPriceCents, 'Expected price', 0, 2147483647);
  costAcknowledgment(b.costAcknowledged, price);
  return { guests: b.guests.map(name => text(name, 'Guest name', 80)), price };
}

@Injectable()
export class SignupsService {
  constructor(@Inject(Database) private readonly db: Database) {}
  private async lockedEvent(tx: Prisma.TransactionClient, eventId: string, allowDraft = false) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Event not found.');
    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
    if (event.deletedAt || !(event.status === 'PUBLISHED' || allowDraft && event.status === 'DRAFT') || event.startsAt <= new Date()) throw new ConflictException('Registration changes are available only for future published events.');
    return event;
  }
  private async charge(tx: Prisma.TransactionClient, event: Event, seats: { id: string; quotedPriceCents: number }[]) {
    await tx.paymentObligation.createMany({ data: seats.map(s => ({
      signupId: s.id, amountCents: s.quotedPriceCents, currency: event.currency,
      status: s.quotedPriceCents === 0 ? 'NOT_REQUIRED' as const : 'UNPAID' as const, dueAt: event.endsAt
    })) });
  }
  async join(userId: string, eventId: string, value: unknown) {
    uuid(eventId);
    const { guests, price } = signupInput(value);
    await refreshPaymentStrikes(this.db, [userId]);
    return this.db.$transaction(async tx => {
      const event = await this.lockedEvent(tx, eventId);
      return this.bookParty(tx, event, userId, guests, price, 'PLAYER_JOIN');

    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 15000 });
  }
  // Caller holds the event lock (or has just created the event in this transaction).
  async bookParty(tx: Prisma.TransactionClient, event: Event, userId: string, guests: string[], price: number, costSource?: 'PLAYER_JOIN' | 'PLAYER_INVITATION') {
    const eventId = event.id;
      const existing = await tx.signup.findMany({ where: { eventId, userId, status: { in: ['CONFIRMED', 'WAITLISTED'] } }, orderBy: { guestNumber: 'asc' } });
      if (existing.length) {
        if (existing[0].quotedPriceCents === price && JSON.stringify(existing.slice(1).map(s => s.guestName)) === JSON.stringify(guests)) return existing;
        throw new ConflictException('You already have a booking. Cancel it before changing your party.');
      }
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const waiver = await tx.waiverAcceptance.findUnique({ where: { userId_version: { userId, version: waiverVersion } } });
      if (!waiver || waiver.contentHash !== waiverHash) throw new ConflictException({ code: 'WAIVER_REQUIRED', message: 'Before joining a game, review and electronically sign the participation and strike rules waiver in My profile. Existing bookings are kept.' });
      const strikeCount = await tx.strike.count({ where: { ...currentStrikes(), userId } });
      if (strikeCount >= strikeLimit) throw new ConflictException({ code: 'JOIN_BLOCKED_STRIKES', strikeCount, message: 'Joining is blocked because you have 3 or more current strikes, including payment discrepancies, attendance incidents or administrator strikes. Open My profile to review the reasons and contact the organizer about payments. Existing bookings are kept.' });
      if (guests.length > event.maxGuestsPerUser || guests.length + 1 > event.capacity) throw new BadRequestException('Your party exceeds the guest allowance or event capacity.');
      if (price !== event.priceCents) throw new ConflictException('The event price changed. Refresh and review the price before joining.');
      const confirmed = await tx.signup.count({ where: { eventId, status: 'CONFIRMED' } });
      const queued = await tx.signup.count({ where: { eventId, status: 'WAITLISTED', guestNumber: 0 } });
      const status = !queued && confirmed + guests.length + 1 <= event.capacity ? 'CONFIRMED' as const : 'WAITLISTED' as const;
      const bookingId = randomUUID(), queuedAt = new Date();
      await tx.signup.createMany({ data: [null, ...guests].map((guestName, guestNumber) => ({
        eventId, userId, bookingId, guestNumber, guestName, status, quotedPriceCents: price, queuedAt,
        guestPaymentAcknowledgedAt: guests.length ? queuedAt : null, guestPaymentTermsVersion: guests.length ? 'guest-payment-v1' : null,
        confirmedAt: status === 'CONFIRMED' ? queuedAt : null
      })) });
      const seats = await tx.signup.findMany({ where: { bookingId }, orderBy: { guestNumber: 'asc' } });
      if (status === 'CONFIRMED') await this.charge(tx, event, seats);
      if (price > 0 && costSource) await tx.auditLog.create({ data: { actorId: userId, eventId, action: 'PLAYER_EVENT_COST_ACKNOWLEDGED', details: { bookingId, priceCents: price, currency: event.currency, partySize: seats.length, totalCents: price * seats.length, source: costSource, termsVersion: 'event-cost-v1' } } });
      return seats;
  }
  async cancel(userId: string, eventId: string, bookingId: string, organizerReason?: string, administrator = false) {
    uuid(eventId); uuid(bookingId);
    return this.db.$transaction(async tx => {
      const event = await this.lockedEvent(tx, eventId, true);
      if (organizerReason !== undefined && !administrator && event.organizerId !== userId) throw new NotFoundException('Booking not found.');
      const seats = await tx.signup.findMany({ where: { eventId, ...(organizerReason === undefined ? { userId } : {}), bookingId } });
      if (!seats.length) throw new NotFoundException('Booking not found.');
      if (seats.every(s => s.status === 'CANCELLED')) return { status: 'CANCELLED', lateCancellation: seats[0].lateCancellation };
      const now = new Date();
      const lateCancellation = event.status === 'PUBLISHED' && organizerReason === undefined && seats[0].status === 'CONFIRMED' && now.getTime() >= event.startsAt.getTime() - event.cancellationCutoffHours * 3600000;
      await tx.signup.updateMany({ where: { eventId, bookingId }, data: { status: 'CANCELLED', cancellationSource: organizerReason === undefined ? 'PLAYER' : 'ORGANIZER', teamNumber: null, cancelledAt: now, lateCancellation } });
      await tx.paymentObligation.updateMany({ where: { signupId: { in: seats.map(s => s.id) } }, data: { status: 'VOID' } });
      if (organizerReason !== undefined) {
        await tx.auditLog.create({ data: { actorId: userId, eventId, action: 'ORGANIZER_REMOVED_PARTY', details: { bookingId, reason: organizerReason } } });
        await tx.notification.create({ data: { userId: seats[0].userId, kind: 'BOOKING_REMOVED', dedupeKey: `removed:${bookingId}`, payload: { eventId, bookingId } } });
      }
      await this.promote(tx, event);
      return { status: 'CANCELLED', lateCancellation };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 15000 });
  }
  async overridePromotion(actorId: string, eventId: string, bookingId: string, reason: string, administrator = false) {
    uuid(eventId); uuid(bookingId);
    return this.db.$transaction(async tx => {
      const event = await this.lockedEvent(tx, eventId);
      if (!administrator && event.organizerId !== actorId) throw new NotFoundException('Event not found.');
      const seats = await tx.signup.findMany({ where: { eventId, bookingId }, orderBy: { guestNumber: 'asc' } });
      if (!seats.length || seats.some(s => s.status === 'CANCELLED')) throw new NotFoundException('Active booking not found.');
      if (seats.every(s => s.status === 'CONFIRMED')) return seats;
      const count = await tx.signup.count({ where: { eventId, status: 'CONFIRMED' } });
      if (count + seats.length > event.capacity) throw new ConflictException('The whole party must fit within the event capacity.');
      await tx.signup.updateMany({ where: { eventId, bookingId }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
      await this.charge(tx, event, seats);
      await tx.auditLog.create({ data: { actorId, eventId, action: 'ORGANIZER_PROMOTED_PARTY', details: { bookingId, reason } } });
      await tx.notification.create({ data: { userId: seats[0].userId, kind: 'WAITLIST_PROMOTED', dedupeKey: `promotion:${bookingId}`, payload: { eventId, bookingId, seats: seats.length } } });
      return seats;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 15000 });
  }
  // Caller must hold this event's row lock throughout the transaction.
  async promote(tx: Prisma.TransactionClient, event: Event) {
    if (event.status !== 'PUBLISHED') return;
    let available = event.capacity - await tx.signup.count({ where: { eventId: event.id, status: 'CONFIRMED' } });
    const hosts = await tx.signup.findMany({ where: { eventId: event.id, status: 'WAITLISTED', guestNumber: 0 }, orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }] });
    for (const host of hosts) {
      const seats = await tx.signup.findMany({ where: { bookingId: host.bookingId, status: 'WAITLISTED' } });
      if (seats.length > available) break; // FIFO: never split or bypass the head party.
      await tx.signup.updateMany({ where: { bookingId: host.bookingId, status: 'WAITLISTED' }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
      await this.charge(tx, event, seats);
      await tx.notification.create({ data: { userId: host.userId, kind: 'WAITLIST_PROMOTED', dedupeKey: `promotion:${host.bookingId}`, payload: { eventId: event.id, bookingId: host.bookingId, seats: seats.length } } });
      available -= seats.length;
    }
  }
  async mine(userId: string, includeEventId?: string) {
    if (includeEventId !== undefined) uuid(includeEventId);
    // Select distinct recent events, then retain every complete booking attempt for those events.
    const events = await this.db.signup.groupBy({ by: ['eventId'], where: { userId, guestNumber: 0 }, _max: { queuedAt: true }, orderBy: [{ _max: { queuedAt: 'desc' } }, { eventId: 'asc' }], take: 100 });
    const eventIds = [...new Set([...events.map(event => event.eventId), ...(includeEventId ? [includeEventId] : [])])];
    const history = await this.db.signup.groupBy({ by: ['eventId', 'status', 'cancellationSource'], where: { userId, guestNumber: 0, eventId: { in: eventIds } }, _count: true });
    const seats = await this.db.signup.findMany({ where: { userId, eventId: { in: eventIds } }, include: { strikes: { select: { id: true, reason: true, createdAt: true, revokedAt: true, expiresAt: true } }, payment: true, event: { select: { id: true, title: true, description: true, capacity: true, teamCount: true, teamBalancingEnabled: true, organizerContactEmail: true, organizerContactPhone: true, contactCallAllowed: true, contactTextAllowed: true, bibsProvided: true, shirtColorCount: true, minPlayers: true, _count: { select: { signups: { where: { status: 'CONFIRMED' } } } }, startsAt: true, endsAt: true, status: true, cancellationCutoffHours: true, location: true, organizer: { select: appearanceSelect } } } }, orderBy: [{ queuedAt: 'desc' }, { bookingId: 'asc' }, { guestNumber: 'asc' }] });
    return seats.map(seat => { const { _count, ...event } = seat.event; const records = history.filter(record => record.eventId === seat.eventId); return { ...seat, bookingCount: records.reduce((sum, record) => sum + record._count, 0), playerCancellationCount: records.filter(record => record.status === 'CANCELLED' && record.cancellationSource === 'PLAYER').reduce((sum, record) => sum + record._count, 0), legacyCancellationCount: records.filter(record => record.status === 'CANCELLED' && record.cancellationSource === null).reduce((sum, record) => sum + record._count, 0), event: { ...event, confirmed: _count.signups, organizer: appearance(event.organizer) } }; });
  }
  async participants(userId: string, eventId: string) {
    uuid(eventId);
    const membership = await this.db.signup.findFirst({ where: { eventId, userId, guestNumber: 0, status: { in: ['CONFIRMED', 'WAITLISTED'] }, event: { deletedAt: null, status: { in: ['PUBLISHED', 'COMPLETED'] } } }, select: { id: true } });
    if (!membership) throw new NotFoundException('Join this game to view its players.');
    const seats = await this.db.signup.findMany({
      where: { eventId, status: { in: ['CONFIRMED', 'WAITLISTED'] } },
      select: { id: true, teamNumber: true, guestNumber: true, guestName: true, status: true, user: { select: appearanceSelect } },
      orderBy: [{ queuedAt: 'asc' }, { bookingId: 'asc' }, { guestNumber: 'asc' }]
    });
    return seats.map(s => ({ id: s.id, name: s.guestNumber === 0 ? appearance(s.user).displayName : s.guestName, isGuest: s.guestNumber > 0, status: s.status, teamNumber: s.teamNumber, avatarUrl: s.guestNumber === 0 ? appearance(s.user).avatarUrl : null, avatarColor: s.user.avatarColor, guestOf: s.guestNumber > 0 ? appearance(s.user).displayName : null }));
  }
  async roster(userId: string, eventId: string, administrator = false) {
    uuid(eventId);
    if (!await this.db.event.findFirst({ where: { id: eventId, ...(administrator ? {} : { organizerId: userId }) } })) throw new NotFoundException('Event not found.');
    const accounts = await this.db.signup.findMany({ where: { eventId }, select: { userId: true }, distinct: ['userId'] });
    const userIds = accounts.map(seat => seat.userId);
    await refreshPaymentStrikes(this.db, userIds);
    const counts = await this.db.strike.groupBy({ by: ['userId'], where: { ...currentStrikes(), userId: { in: userIds } }, _count: true });
    const seats = await this.db.signup.findMany({ where: { eventId }, select: { userId: true, cancellationSource: true, teamNumber: true, guestPaymentAcknowledgedAt: true, guestPaymentTermsVersion: true, attendance: true, lateCancellation: true, strikes: { select: { id: true, reason: true, revokedAt: true, expiresAt: true } }, id: true, bookingId: true, guestNumber: true, guestName: true, status: true, queuedAt: true, event: { select: { startsAt: true, endsAt: true, status: true } }, user: { select: { ...appearanceSelect, adminSkillLevel: true, skillLevel: true, email: true, contactEmail: true, phone: true } }, payment: { select: { amountCents: true, status: true, playerPaid: true, playerReviewedAt: true, organizerPaid: true, organizerReviewedAt: true } } }, orderBy: [{ queuedAt: 'asc' }, { bookingId: 'asc' }, { guestNumber: 'asc' }] });
    const cancellations = await this.db.signup.groupBy({ by: ['userId'], where: { eventId, guestNumber: 0, status: 'CANCELLED', cancellationSource: 'PLAYER' }, _count: true });
    return seats.map(seat => ({ ...seat, user: { ...appearance(seat.user), strikeCount: counts.find(record => record.userId === seat.userId)?._count ?? 0, eventCancellationCount: cancellations.find(record => record.userId === seat.userId)?._count ?? 0, accountName: seat.user.displayName, nickname: seat.user.nickname, skillLevel: seat.user.skillLevel, adminSkillLevel: seat.user.adminSkillLevel, contactEmail: seat.user.contactEmail ?? seat.user.email, phone: seat.user.phone } }));
  }
}

@Controller('api') @UseGuards(FirebaseGuard)
export class SignupsController {
  constructor(@Inject(SignupsService) private readonly signups: SignupsService) {}
  @Get('me/signups') mine(@Req() req: AuthRequest, @Query('includeEventId') includeEventId?: string) { return this.signups.mine(req.user.id, includeEventId); }
  @Get('events/:id/players') players(@Req() req: AuthRequest, @Param('id') id: string) { return this.signups.participants(req.user.id, id); }
  @Post('events/:id/signups') join(@Req() req: AuthRequest, @Param('id') id: string, @Body() value: unknown) { return this.signups.join(req.user.id, id, value); }
  @Post('events/:id/signups/:bookingId/cancel') cancel(@Req() req: AuthRequest, @Param('id') id: string, @Param('bookingId') bookingId: string) { return this.signups.cancel(req.user.id, id, bookingId); }
  @Get('organizer/events/:id/roster') @UseGuards(OrganizerGuard)
  roster(@Req() req: AuthRequest, @Param('id') id: string) { return this.signups.roster(req.user.id, id, req.user.role === 'ADMINISTRATOR'); }
  @Post('organizer/events/:id/bookings/:bookingId/remove') @UseGuards(OrganizerGuard)
  remove(@Req() req: AuthRequest, @Param('id') id: string, @Param('bookingId') bookingId: string, @Body() value: unknown) { return this.signups.cancel(req.user.id, id, bookingId, text(object(value, ['reason']).reason, 'Override reason', 1000), req.user.role === 'ADMINISTRATOR'); }
  @Post('organizer/events/:id/bookings/:bookingId/promote') @UseGuards(OrganizerGuard)
  promote(@Req() req: AuthRequest, @Param('id') id: string, @Param('bookingId') bookingId: string, @Body() value: unknown) { return this.signups.overridePromotion(req.user.id, id, bookingId, text(object(value, ['reason']).reason, 'Override reason', 1000), req.user.role === 'ADMINISTRATOR'); }
}
