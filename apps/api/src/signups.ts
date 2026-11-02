import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Event, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthRequest, FirebaseGuard, OrganizerGuard } from './auth';
import { appearance, appearanceSelect } from './profile-fields';
import { Database } from './database';
import { integer, object, text, uuid } from './validation';

export function signupInput(value: unknown) {
  const b = object(value, ['guests', 'expectedPriceCents']);
  if (!Array.isArray(b.guests) || b.guests.length > 20) throw new BadRequestException('Provide up to 20 guest names.');
  return { guests: b.guests.map(name => text(name, 'Guest name', 80)), price: integer(b.expectedPriceCents, 'Expected price', 0, 2147483647) };
}

@Injectable()
export class SignupsService {
  constructor(@Inject(Database) private readonly db: Database) {}
  private async lockedEvent(tx: Prisma.TransactionClient, eventId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Event not found.');
    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
    if (event.deletedAt || event.status !== 'PUBLISHED' || event.startsAt <= new Date()) throw new ConflictException('Registration changes are available only for future published events.');
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
    return this.db.$transaction(async tx => {
      const event = await this.lockedEvent(tx, eventId);
      const existing = await tx.signup.findMany({ where: { eventId, userId, status: { in: ['CONFIRMED', 'WAITLISTED'] } }, orderBy: { guestNumber: 'asc' } });
      if (existing.length) {
        if (existing[0].quotedPriceCents === price && JSON.stringify(existing.slice(1).map(s => s.guestName)) === JSON.stringify(guests)) return existing;
        throw new ConflictException('You already have a booking. Cancel it before changing your party.');
      }
      if (guests.length > event.maxGuestsPerUser || guests.length + 1 > event.capacity) throw new BadRequestException('Your party exceeds the guest allowance or event capacity.');
      if (price !== event.priceCents) throw new ConflictException('The event price changed. Refresh and review the price before joining.');
      const confirmed = await tx.signup.count({ where: { eventId, status: 'CONFIRMED' } });
      const queued = await tx.signup.count({ where: { eventId, status: 'WAITLISTED', guestNumber: 0 } });
      const status = !queued && confirmed + guests.length + 1 <= event.capacity ? 'CONFIRMED' as const : 'WAITLISTED' as const;
      const bookingId = randomUUID(), queuedAt = new Date();
      await tx.signup.createMany({ data: [null, ...guests].map((guestName, guestNumber) => ({
        eventId, userId, bookingId, guestNumber, guestName, status, quotedPriceCents: price, queuedAt,
        confirmedAt: status === 'CONFIRMED' ? queuedAt : null
      })) });
      const seats = await tx.signup.findMany({ where: { bookingId }, orderBy: { guestNumber: 'asc' } });
      if (status === 'CONFIRMED') await this.charge(tx, event, seats);
      return seats;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 15000 });
  }
  async cancel(userId: string, eventId: string, bookingId: string, organizerReason?: string, administrator = false) {
    uuid(eventId); uuid(bookingId);
    return this.db.$transaction(async tx => {
      const event = await this.lockedEvent(tx, eventId);
      if (organizerReason !== undefined && !administrator && event.organizerId !== userId) throw new NotFoundException('Booking not found.');
      const seats = await tx.signup.findMany({ where: { eventId, ...(organizerReason === undefined ? { userId } : {}), bookingId } });
      if (!seats.length) throw new NotFoundException('Booking not found.');
      if (seats.every(s => s.status === 'CANCELLED')) return { status: 'CANCELLED', lateCancellation: seats[0].lateCancellation };
      const now = new Date();
      const lateCancellation = organizerReason === undefined && seats[0].status === 'CONFIRMED' && now.getTime() >= event.startsAt.getTime() - event.cancellationCutoffHours * 3600000;
      await tx.signup.updateMany({ where: { eventId, bookingId }, data: { status: 'CANCELLED', cancelledAt: now, lateCancellation } });
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
  async mine(userId: string) {
    // Limit by whole bookings so pagination never cuts off a party's guests.
    const hosts = await this.db.signup.findMany({ where: { userId, guestNumber: 0 }, select: { bookingId: true }, orderBy: [{ queuedAt: 'desc' }, { id: 'desc' }], take: 100 });
    const seats = await this.db.signup.findMany({ where: { userId, bookingId: { in: hosts.map(h => h.bookingId) } }, include: { strikes: { select: { id: true, reason: true, createdAt: true, revokedAt: true, expiresAt: true } }, payment: true, event: { select: { id: true, title: true, description: true, capacity: true, startsAt: true, endsAt: true, status: true, cancellationCutoffHours: true, location: true, organizer: { select: appearanceSelect } } } }, orderBy: [{ queuedAt: 'desc' }, { bookingId: 'asc' }, { guestNumber: 'asc' }] });
    return seats.map(seat => ({ ...seat, event: { ...seat.event, organizer: appearance(seat.event.organizer) } }));
  }
  async participants(userId: string, eventId: string) {
    uuid(eventId);
    const membership = await this.db.signup.findFirst({ where: { eventId, userId, guestNumber: 0, status: { in: ['CONFIRMED', 'WAITLISTED'] }, event: { deletedAt: null, status: { in: ['PUBLISHED', 'COMPLETED'] } } }, select: { id: true } });
    if (!membership) throw new NotFoundException('Join this game to view its players.');
    const seats = await this.db.signup.findMany({
      where: { eventId, status: { in: ['CONFIRMED', 'WAITLISTED'] } },
      select: { id: true, guestNumber: true, guestName: true, status: true, user: { select: appearanceSelect } },
      orderBy: [{ queuedAt: 'asc' }, { bookingId: 'asc' }, { guestNumber: 'asc' }]
    });
    return seats.map(s => ({ id: s.id, name: s.guestNumber === 0 ? s.user.displayName : s.guestName, isGuest: s.guestNumber > 0, status: s.status, avatarUrl: s.guestNumber === 0 ? appearance(s.user).avatarUrl : null, avatarColor: s.user.avatarColor, guestOf: s.guestNumber > 0 ? s.user.displayName : null }));
  }
  async roster(userId: string, eventId: string, administrator = false) {
    uuid(eventId);
    if (!await this.db.event.findFirst({ where: { id: eventId, ...(administrator ? {} : { organizerId: userId }) } })) throw new NotFoundException('Event not found.');
    const seats = await this.db.signup.findMany({ where: { eventId }, select: { attendance: true, lateCancellation: true, strikes: { select: { id: true, reason: true, revokedAt: true, expiresAt: true } }, id: true, bookingId: true, guestNumber: true, guestName: true, status: true, queuedAt: true, event: { select: { startsAt: true, endsAt: true, status: true } }, user: { select: { ...appearanceSelect, email: true, contactEmail: true, phone: true } }, payment: { select: { amountCents: true, status: true, playerPaid: true, playerReviewedAt: true, organizerPaid: true, organizerReviewedAt: true } } }, orderBy: [{ queuedAt: 'asc' }, { bookingId: 'asc' }, { guestNumber: 'asc' }] });
    return seats.map(seat => ({ ...seat, user: { ...appearance(seat.user), contactEmail: seat.user.contactEmail ?? seat.user.email, phone: seat.user.phone } }));
  }
}

@Controller('api') @UseGuards(FirebaseGuard)
export class SignupsController {
  constructor(@Inject(SignupsService) private readonly signups: SignupsService) {}
  @Get('me/signups') mine(@Req() req: AuthRequest) { return this.signups.mine(req.user.id); }
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
