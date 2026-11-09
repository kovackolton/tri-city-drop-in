import { coOrganizerInput, managedEvents, validateOrganizers, organizerDirectory, notifyOrganizerChanges } from './event-organizers';
import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { eventFilters, matchesEventDate } from './event-filters';
import { eventOptionsInput, initialPlayerSelections } from './event-options';
import { notifyInvitations } from './event-invitation-notices';
import { SignupsService } from './signups';
import { appearance, appearanceSelect } from './profile-fields';
import { eventGuidanceInput } from './event-guidance';
import { refreshPaymentStrikes } from './strike-policy';
import { Database } from './database';
import { AuthRequest, FirebaseGuard, OrganizerGuard } from './auth';
import { instant, integer, object, text, uuid } from './validation';
import { randomBytes } from 'node:crypto';
export function eventInput(value: unknown) {
  const b = object(value, ['title', 'description', 'locationId', 'startsAt', 'endsAt', 'capacity', 'priceCents', 'maxGuestsPerUser', 'cancellationCutoffHours', 'status', 'bibsProvided', 'bibCount', 'shirtColors', 'shirtColorCount', 'minPlayers', 'teamCount', 'teamBalancingEnabled', 'organizerContactEmail', 'organizerContactPhone', 'contactCallAllowed', 'contactTextAllowed', 'initialPlayerIds', 'initialPlayerMode', 'initialPlayers', 'isPrivate', 'coOrganizerIds']);
  if (b.isPrivate !== undefined && typeof b.isPrivate !== 'boolean') throw new BadRequestException('Private game must be a boolean.');
  const startsAt = instant(b.startsAt, 'Start time'), endsAt = instant(b.endsAt, 'End time');
  if (startsAt.getTime() <= Date.now() || endsAt <= startsAt) throw new BadRequestException('Choose a future start and an end after the start.');
  if (b.status !== 'DRAFT' && b.status !== 'PUBLISHED') throw new BadRequestException('Status must be DRAFT or PUBLISHED.');
  const capacity = integer(b.capacity, 'Capacity', 1, 1000), maxGuestsPerUser = integer(b.maxGuestsPerUser ?? 1, 'Guest allowance', 0, 20);
  if (maxGuestsPerUser >= capacity) throw new BadRequestException('Guest allowance must be smaller than capacity.');
  return {
    coOrganizerIds: coOrganizerInput(b.coOrganizerIds),
    ...eventGuidanceInput(b, capacity), ...eventOptionsInput(b),
    isPrivate: b.isPrivate === true,
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
      where: { deletedAt: null, isPrivate: false, status: 'PUBLISHED', startsAt: { gte: new Date() }, ...(filters.locationId ? { locationId: filters.locationId } : {}), ...(filters.organizerId ? { AND: [managedEvents(filters.organizerId)] } : {}), ...(filters.city ? { location: { city: { equals: filters.city, mode: 'insensitive' } } } : {}), ...(filters.freeOnly ? { priceCents: 0 } : {}), ...(filters.search ? { OR: [{ title: { contains: filters.search, mode: 'insensitive' } }, { location: { name: { contains: filters.search, mode: 'insensitive' } } }, { location: { address: { contains: filters.search, mode: 'insensitive' } } }] } : {}) }, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      include: { organizer: { select: appearanceSelect }, location: true, signups: { where: { status: { in: ['CONFIRMED', 'WAITLISTED'] } }, select: { status: true } } }
    });
    const coOrganizers = await organizerDirectory(this.db, events.flatMap(event => event.coOrganizerIds));
    return events.filter(event => matchesEventDate(event.startsAt, event.location.timezone, filters)).map(({ signups, ...e }) => ({
      coOrganizers: coOrganizers.filter(user => e.coOrganizerIds.includes(user.id)).map(user => ({ id: user.id, displayName: user.displayName })), locationId: e.locationId, city: e.location.city, organizerId: e.organizerId, organizer: appearance(e.organizer), teamCount: e.teamCount, teamBalancingEnabled: e.teamBalancingEnabled, organizerContactEmail: e.organizerContactEmail, organizerContactPhone: e.organizerContactPhone, contactCallAllowed: e.contactCallAllowed, contactTextAllowed: e.contactTextAllowed, id: e.id, title: e.title, description: e.description, startsAt: e.startsAt, endsAt: e.endsAt,
      priceCents: e.priceCents, currency: e.currency, timezone: e.location.timezone, maxGuestsPerUser: e.maxGuestsPerUser, cancellationCutoffHours: e.cancellationCutoffHours,
      bibsProvided: e.bibsProvided, bibCount: e.bibCount, shirtColors: e.shirtColors, shirtColorCount: e.shirtColorCount, minPlayers: e.minPlayers, capacity: e.capacity, location: e.location.name, address: e.location.address, photoUrl: e.location.photoUrl, photoCredit: e.location.photoCredit, mapEmbedUrl: e.location.mapEmbedUrl,
      confirmed: signups.filter(s => s.status === 'CONFIRMED').length, waitlisted: signups.filter(s => s.status === 'WAITLISTED').length
    })).filter(event => !filters.spacesOnly || event.confirmed < event.capacity && event.waitlisted === 0).slice(0, 100);
  }
  @Get('events/filters') async filters() {
    const active = { deletedAt: null, isPrivate: false, status: 'PUBLISHED' as const, startsAt: { gte: new Date() } };
    const coIds = (await this.db.event.findMany({ where: active, select: { coOrganizerIds: true } })).flatMap(event => event.coOrganizerIds);
    const [locations, users] = await this.db.$transaction([
      this.db.location.findMany({ where: { events: { some: active } }, select: { id: true, name: true, city: true }, orderBy: { name: 'asc' } }),
      this.db.user.findMany({ where: { OR: [{ events: { some: active } }, { id: { in: coIds } }] }, select: { id: true, displayName: true, nickname: true }, orderBy: { displayName: 'asc' } })
    ]);
    return { locations, organizers: users.map(user => ({ id: user.id, name: user.nickname ?? user.displayName })) };
  }
  @Get('organizer/events') @UseGuards(FirebaseGuard, OrganizerGuard)
  async ownEvents(@Req() req: AuthRequest, @Query('scope') scope = 'mine', @Query() query: Record<string, unknown> = {}) {
    if (!['mine', 'all'].includes(scope)) throw new BadRequestException('Choose My events or All events.');
    const filters = eventFilters(query);
    const period = query['history'] ?? 'all', review = query['review'] ?? '', status = query['status'] ?? '';
    if (!['all', 'upcoming', 'past'].includes(period as string) || !['', 'attendance', 'payment', 'either', 'needs_review', 'in_progress', 'completed'].includes(review as string) || !['', 'DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'].includes(status as string)) throw new BadRequestException('Choose valid event filters.');
    const now = new Date();
    const events = await this.db.event.findMany({ where: { ...(req.user.role === 'ADMINISTRATOR' && scope === 'all' ? { AND: [{ OR: [{ deletedAt: null }, { endsAt: { lte: now } }] }] } : { deletedAt: null, AND: [managedEvents(req.user.id)] }), ...(period === 'past' ? { endsAt: { lte: now } } : period === 'upcoming' ? { endsAt: { gt: now } } : {}), ...(status ? { status: status as 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'CANCELLED' } : {}), ...(filters.locationId ? { locationId: filters.locationId } : {}), ...(filters.search ? { OR: [{ title: { contains: filters.search, mode: 'insensitive' } }, { location: { name: { contains: filters.search, mode: 'insensitive' } } }, { organizer: { displayName: { contains: filters.search, mode: 'insensitive' } } }] } : {}) }, include: { location: true, organizer: { select: appearanceSelect }, auditLogs: { where: { action: { in: ['ATTENDANCE_UPDATED', 'EVENT_REVIEW_COMPLETED'] } }, select: { action: true, createdAt: true, actor: { select: { displayName: true } } }, orderBy: { createdAt: 'desc' } }, signups: { where: { status: 'CONFIRMED' }, select: { attendance: true, payment: { select: { amountCents: true, status: true, organizerPaid: true } } } } }, orderBy: [{ startsAt: 'desc' }, { id: 'desc' }] });
    const additionalOrganizers = await organizerDirectory(this.db, events.flatMap(event => event.coOrganizerIds));
    return events.filter(event => matchesEventDate(event.startsAt, event.location.timezone, filters)).map(({ signups, organizer, auditLogs, privateInviteToken: _invite, ...event }) => {
      const reviewable = !event.deletedAt && ['PUBLISHED', 'COMPLETED'].includes(event.status) && event.endsAt <= now;
      const attendancePending = reviewable ? signups.filter(seat => seat.attendance === 'UNMARKED').length : 0;
      const paymentPending = reviewable ? signups.filter(seat => seat.payment && seat.payment.amountCents > 0 && !['VOID', 'NOT_REQUIRED'].includes(seat.payment.status) && seat.payment.organizerPaid === null).length : 0;
      const completion = auditLogs.find(log => log.action === 'EVENT_REVIEW_COMPLETED');
      const reviewStatus = completion ? 'COMPLETED' : auditLogs.some(log => log.action === 'ATTENDANCE_UPDATED') ? 'IN_PROGRESS' : 'NEEDS_REVIEW';
      return { ...event, coOrganizers: additionalOrganizers.filter(user => event.coOrganizerIds.includes(user.id)), organizer: { ...appearance(organizer), accountName: organizer.displayName }, confirmed: signups.length, attendancePending, paymentPending, reviewStatus, reviewCompletedAt: completion?.createdAt ?? null, reviewCompletedBy: completion?.actor.displayName ?? null };
    }).filter(event => !review || (['needs_review', 'in_progress', 'completed'].includes(review as string) ? event.reviewStatus === String(review).toUpperCase() : review === 'attendance' ? event.attendancePending > 0 : review === 'payment' ? event.paymentPending > 0 : event.attendancePending > 0 || event.paymentPending > 0)).slice(0, 100);
  }
  @Get('organizer/events/overview') @UseGuards(FirebaseGuard, OrganizerGuard)
  async eventOverview(@Query() query: Record<string, unknown> = {}) {
    const filters = eventFilters(query);
    const events = await this.db.event.findMany({
      where: { deletedAt: null, isPrivate: false, status: 'PUBLISHED', endsAt: { gt: new Date() } },
      select: { id: true, coOrganizerIds: true, title: true, startsAt: true, endsAt: true, organizer: { select: { displayName: true, nickname: true } }, location: { select: { name: true, city: true, timezone: true } } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }]
    });
    const coOrganizers = await organizerDirectory(this.db, events.flatMap(event => event.coOrganizerIds));
    return events.filter(event => matchesEventDate(event.startsAt, event.location.timezone, filters) && (!filters.search || `${event.title} ${event.location.name} ${event.organizer.nickname ?? event.organizer.displayName}`.toLowerCase().includes(filters.search.toLowerCase()))).slice(0, 100).map(({ organizer, coOrganizerIds, ...event }) => ({ ...event, coOrganizers: coOrganizers.filter(user => coOrganizerIds.includes(user.id)).map(user => ({ id: user.id, displayName: user.displayName })), organizer: { displayName: organizer.nickname ?? organizer.displayName } }));
  }
  @Get('organizer/organizers') @UseGuards(FirebaseGuard, OrganizerGuard)
  async organizers(@Query('search') search = '') {
    if (typeof search !== 'string' || search.length > 80) throw new BadRequestException('Search must be at most 80 characters.');
    const users = await this.db.user.findMany({ where: { role: { in: ['ORGANIZER', 'ADMINISTRATOR'] }, ...(search.trim() ? { OR: [{ displayName: { contains: search.trim(), mode: 'insensitive' } }, { nickname: { contains: search.trim(), mode: 'insensitive' } }] } : {}) }, select: { id: true, ...appearanceSelect }, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], take: 50 });
    return users.map(user => ({ id: user.id, ...appearance(user), accountName: user.displayName }));
  }
  @Get('locations') @UseGuards(FirebaseGuard, OrganizerGuard)
  locations() { return this.db.location.findMany({ orderBy: { name: 'asc' }, take: 500 }); }
  @Post('events') @UseGuards(FirebaseGuard, OrganizerGuard)
  async create(@Req() req: AuthRequest, @Body() value: unknown) {
    const data = eventInput(value);
    const selections = initialPlayerSelections(value as Record<string, unknown>);
    const initial = { ids: selections.map(player => player.userId), mode: selections.every(player => player.mode === 'INVITE') ? 'INVITE' : selections.every(player => player.mode === 'BOOK') ? 'BOOK' : 'MIXED' };
    const bookedIds = selections.filter(player => player.mode === 'BOOK').map(player => player.userId);
    if (bookedIds.length) await refreshPaymentStrikes(this.db, bookedIds);
    if (!await this.db.location.findUnique({ where: { id: data.locationId } })) throw new BadRequestException('Location does not exist.');
    return this.db.$transaction(async tx => {
      if (initial.ids.length !== await tx.user.count({ where: { id: { in: initial.ids } } })) throw new BadRequestException('A selected player no longer exists. Refresh the selection.');
      await validateOrganizers(tx, data.coOrganizerIds, req.user.id);
      const event = await tx.event.create({ data: { ...data, privateInviteToken: data.isPrivate ? randomBytes(32).toString('hex') : null, organizerId: req.user.id } });
      await tx.auditLog.create({ data: { actorId: req.user.id, eventId: event.id, action: 'EVENT_CREATED', details: { isPrivate: data.isPrivate, coOrganizerIds: data.coOrganizerIds, initialPlayers: selections.map(player => ({ ...player })), initialPlayerMode: initial.mode, initialPlayerIds: initial.ids, teamCount: data.teamCount, teamBalancingEnabled: data.teamBalancingEnabled, status: data.status, priceCents: data.priceCents, bibsProvided: data.bibsProvided, bibCount: data.bibCount, shirtColors: data.shirtColors, shirtColorCount: data.shirtColorCount, minPlayers: data.minPlayers } } });
      await notifyOrganizerChanges(tx, event);
      for (const userId of [...bookedIds].sort()) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const inviteIds = selections.filter(player => player.mode === 'INVITE').map(player => player.userId);
      if (inviteIds.length) { await tx.eventInvitation.createMany({ data: inviteIds.map(userId => ({ eventId: event.id, userId })) }); await notifyInvitations(tx, event); }
      for (const userId of bookedIds) {
        const seats = await this.signups.bookParty(tx, event, userId, [], event.priceCents, undefined, event.privateInviteToken ?? undefined);
        await tx.auditLog.create({ data: { actorId: req.user.id, eventId: event.id, action: 'ORGANIZER_BOOKED_PLAYER', details: { userId, bookingId: seats[0].bookingId, priceCents: event.priceCents, status: seats[0].status, playerConfirmation: false } } });
        await tx.notification.create({ data: { userId, kind: 'ORGANIZER_BOOKED_PLAYER', dedupeKey: `added:${seats[0].bookingId}`, payload: { eventId: event.id, title: event.title, draft: event.status === 'DRAFT' } } });
      }
      const { privateInviteToken: _invite, ...result } = event; return result;
    }, { maxWait: 10000, timeout: 15000 });
  }
  @Post('events/:id/publish') @UseGuards(FirebaseGuard, OrganizerGuard)
  async publish(@Req() req: AuthRequest, @Param('id') id: string) {
    uuid(id);
    return this.db.$transaction(async tx => {
      const result = await tx.event.updateMany({ where: { id, deletedAt: null, ...(req.user.role === 'ADMINISTRATOR' ? {} : managedEvents(req.user.id)), status: 'DRAFT', startsAt: { gt: new Date() } }, data: { status: 'PUBLISHED' } });
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
