import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { eventFilters, matchesEventDate } from './event-filters';
import { eventOptionsInput, initialPlayersInput } from './event-options';
import { notifyInvitations } from './event-invitation-notices';
import { SignupsService } from './signups';
import { appearance, appearanceSelect } from './profile-fields';
import { eventGuidanceInput } from './event-guidance';
import { refreshPaymentStrikes } from './strike-policy';
import { Database } from './database';
import { AuthRequest, FirebaseGuard, OrganizerGuard } from './auth';
import { instant, integer, object, text, uuid } from './validation';
export function eventInput(value: unknown) {
  const b = object(value, ['title', 'description', 'locationId', 'startsAt', 'endsAt', 'capacity', 'priceCents', 'maxGuestsPerUser', 'cancellationCutoffHours', 'status', 'bibsProvided', 'shirtColorCount', 'minPlayers', 'teamCount', 'teamBalancingEnabled', 'organizerContactEmail', 'organizerContactPhone', 'contactCallAllowed', 'contactTextAllowed', 'initialPlayerIds', 'initialPlayerMode']);
  const startsAt = instant(b.startsAt, 'Start time'), endsAt = instant(b.endsAt, 'End time');
  if (startsAt.getTime() <= Date.now() || endsAt <= startsAt) throw new BadRequestException('Choose a future start and an end after the start.');
  if (b.status !== 'DRAFT' && b.status !== 'PUBLISHED') throw new BadRequestException('Status must be DRAFT or PUBLISHED.');
  const capacity = integer(b.capacity, 'Capacity', 1, 1000), maxGuestsPerUser = integer(b.maxGuestsPerUser ?? 1, 'Guest allowance', 0, 20);
  if (maxGuestsPerUser >= capacity) throw new BadRequestException('Guest allowance must be smaller than capacity.');
  return {
    ...eventGuidanceInput(b, capacity), ...eventOptionsInput(b),
    title: text(b.title, 'Title'), description: b.description === undefined || b.description === null || b.description === '' ? null : text(b.description, 'Description', 4000),
    locationId: uuid(text(b.locationId, 'Location ID')), startsAt, endsAt, capacity,
    priceCents: integer(b.priceCents, 'Price in cents', 0, 2147483647), currency: 'USD' as const,
    maxGuestsPerUser, cancellationCutoffHours: integer(b.cancellationCutoffHours ?? 12, 'Cancellation cutoff', 0, 8760), status: b.status as 'DRAFT' | 'PUBLISHED'
  };
}
@Controller('api')
export class EventsController {
  constructor(@Inject(Database) private readonly db: Database, @Inject(SignupsService) private readonly signups: SignupsService = new SignupsService(db)) {}
  @Get('health') health() { return { status: 'ok' }; }
  @Get('events') async events(@Query() query: Record<string, unknown> = {}) {
    const filters = eventFilters(query);
    const events = await this.db.event.findMany({
      where: { deletedAt: null, status: 'PUBLISHED', startsAt: { gte: new Date() }, ...(filters.locationId ? { locationId: filters.locationId } : {}), ...(filters.organizerId ? { organizerId: filters.organizerId } : {}), ...(filters.city ? { location: { city: { equals: filters.city, mode: 'insensitive' } } } : {}), ...(filters.freeOnly ? { priceCents: 0 } : {}), ...(filters.search ? { OR: [{ title: { contains: filters.search, mode: 'insensitive' } }, { location: { name: { contains: filters.search, mode: 'insensitive' } } }, { location: { address: { contains: filters.search, mode: 'insensitive' } } }] } : {}) }, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      include: { organizer: { select: appearanceSelect }, location: true, signups: { where: { status: { in: ['CONFIRMED', 'WAITLISTED'] } }, select: { status: true } } }
    });
    return events.filter(event => matchesEventDate(event.startsAt, event.location.timezone, filters)).map(({ signups, ...e }) => ({
      locationId: e.locationId, city: e.location.city, organizerId: e.organizerId, organizer: appearance(e.organizer), teamCount: e.teamCount, teamBalancingEnabled: e.teamBalancingEnabled, organizerContactEmail: e.organizerContactEmail, organizerContactPhone: e.organizerContactPhone, contactCallAllowed: e.contactCallAllowed, contactTextAllowed: e.contactTextAllowed, id: e.id, title: e.title, description: e.description, startsAt: e.startsAt, endsAt: e.endsAt,
      priceCents: e.priceCents, currency: e.currency, timezone: e.location.timezone, maxGuestsPerUser: e.maxGuestsPerUser, cancellationCutoffHours: e.cancellationCutoffHours,
      bibsProvided: e.bibsProvided, shirtColorCount: e.shirtColorCount, minPlayers: e.minPlayers, capacity: e.capacity, location: e.location.name, address: e.location.address, photoUrl: e.location.photoUrl, photoCredit: e.location.photoCredit, mapEmbedUrl: e.location.mapEmbedUrl,
      confirmed: signups.filter(s => s.status === 'CONFIRMED').length, waitlisted: signups.filter(s => s.status === 'WAITLISTED').length
    })).filter(event => !filters.spacesOnly || event.confirmed < event.capacity && event.waitlisted === 0).slice(0, 100);
  }
  @Get('events/filters') async filters() {
    const active = { deletedAt: null, status: 'PUBLISHED' as const, startsAt: { gte: new Date() } };
    const [locations, users] = await this.db.$transaction([
      this.db.location.findMany({ where: { events: { some: active } }, select: { id: true, name: true, city: true }, orderBy: { name: 'asc' } }),
      this.db.user.findMany({ where: { events: { some: active } }, select: { id: true, displayName: true, nickname: true }, orderBy: { displayName: 'asc' } })
    ]);
    return { locations, organizers: users.map(user => ({ id: user.id, name: user.nickname ?? user.displayName })) };
  }
  @Get('organizer/events') @UseGuards(FirebaseGuard, OrganizerGuard)
  async ownEvents(@Req() req: AuthRequest, @Query('scope') scope = 'mine') {
    if (!['mine', 'all'].includes(scope)) throw new BadRequestException('Choose My events or All events.');
    const events = await this.db.event.findMany({ where: { deletedAt: null, ...(req.user.role === 'ADMINISTRATOR' && scope === 'all' ? {} : { organizerId: req.user.id }) }, include: { location: true, organizer: { select: appearanceSelect }, _count: { select: { signups: { where: { status: 'CONFIRMED' } } } } }, orderBy: { startsAt: 'desc' }, take: 100 });
    return events.map(({ _count, organizer, ...event }) => ({ ...event, organizer: { ...appearance(organizer), accountName: organizer.displayName }, confirmed: _count.signups }));
  }
  @Get('organizer/events/overview') @UseGuards(FirebaseGuard, OrganizerGuard)
  async eventOverview() {
    const events = await this.db.event.findMany({
      where: { deletedAt: null, status: 'PUBLISHED', endsAt: { gt: new Date() } },
      select: { id: true, title: true, startsAt: true, endsAt: true, organizer: { select: { displayName: true, nickname: true } }, location: { select: { name: true, city: true, timezone: true } } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }], take: 100
    });
    return events.map(({ organizer, ...event }) => ({ ...event, organizer: { displayName: organizer.nickname ?? organizer.displayName } }));
  }
  @Get('locations') @UseGuards(FirebaseGuard, OrganizerGuard)
  locations() { return this.db.location.findMany({ orderBy: { name: 'asc' }, take: 500 }); }
  @Post('events') @UseGuards(FirebaseGuard, OrganizerGuard)
  async create(@Req() req: AuthRequest, @Body() value: unknown) {
    const data = eventInput(value);
    const initial = initialPlayersInput(value as Record<string, unknown>);
    if (initial.mode === 'BOOK') await refreshPaymentStrikes(this.db, initial.ids);
    if (!await this.db.location.findUnique({ where: { id: data.locationId } })) throw new BadRequestException('Location does not exist.');
    return this.db.$transaction(async tx => {
      if (initial.ids.length !== await tx.user.count({ where: { id: { in: initial.ids } } })) throw new BadRequestException('A selected player no longer exists. Refresh the selection.');
      const event = await tx.event.create({ data: { ...data, organizerId: req.user.id } });
      await tx.auditLog.create({ data: { actorId: req.user.id, eventId: event.id, action: 'EVENT_CREATED', details: { initialPlayerMode: initial.mode, initialPlayerIds: initial.ids, teamCount: data.teamCount, teamBalancingEnabled: data.teamBalancingEnabled, status: data.status, priceCents: data.priceCents, bibsProvided: data.bibsProvided, shirtColorCount: data.shirtColorCount, minPlayers: data.minPlayers } } });
      if (initial.mode === 'BOOK') for (const userId of [...initial.ids].sort()) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      if (initial.mode === 'INVITE' && initial.ids.length) {
        await tx.eventInvitation.createMany({ data: initial.ids.map(userId => ({ eventId: event.id, userId })) });
        await notifyInvitations(tx, event);
      } else for (const userId of initial.ids) {
        const seats = await this.signups.bookParty(tx, event, userId, [], event.priceCents);
        await tx.auditLog.create({ data: { actorId: req.user.id, eventId: event.id, action: 'ORGANIZER_BOOKED_PLAYER', details: { userId, bookingId: seats[0].bookingId, priceCents: event.priceCents, status: seats[0].status } } });
        await tx.notification.create({ data: { userId, kind: 'ORGANIZER_BOOKED_PLAYER', dedupeKey: `added:${seats[0].bookingId}`, payload: { eventId: event.id, title: event.title, draft: event.status === 'DRAFT' } } });
      }
      return event;
    }, { maxWait: 10000, timeout: 15000 });
  }
  @Post('events/:id/publish') @UseGuards(FirebaseGuard, OrganizerGuard)
  async publish(@Req() req: AuthRequest, @Param('id') id: string) {
    uuid(id);
    return this.db.$transaction(async tx => {
      const result = await tx.event.updateMany({ where: { id, deletedAt: null, ...(req.user.role === 'ADMINISTRATOR' ? {} : { organizerId: req.user.id }), status: 'DRAFT', startsAt: { gt: new Date() } }, data: { status: 'PUBLISHED' } });
      if (result.count !== 1) throw new BadRequestException('Only your future draft events can be published.');
      const audit = await tx.auditLog.create({ data: { actorId: req.user.id, eventId: id, action: 'EVENT_PUBLISHED', details: {} } });
      const event = await tx.event.findUniqueOrThrow({ where: { id } });
      await this.signups.promote(tx, event);
      await notifyInvitations(tx, event);
      const hosts = await tx.signup.findMany({ where: { eventId: id, guestNumber: 0, status: { in: ['CONFIRMED', 'WAITLISTED'] } }, select: { userId: true } });
      for (const host of hosts) await tx.notification.create({ data: { userId: host.userId, kind: 'EVENT_PUBLISHED', dedupeKey: `published:${audit.id}:${host.userId}`, payload: { eventId: id, title: event.title } } });
      return { id, status: 'PUBLISHED' };
    });
  }
}
