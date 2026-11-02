import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { Database } from './database';
import { AuthRequest, FirebaseGuard, OrganizerGuard } from './auth';
import { instant, integer, object, text, uuid } from './validation';
export function eventInput(value: unknown) {
  const b = object(value, ['title', 'description', 'locationId', 'startsAt', 'endsAt', 'capacity', 'priceCents', 'maxGuestsPerUser', 'cancellationCutoffHours', 'status']);
  const startsAt = instant(b.startsAt, 'Start time'), endsAt = instant(b.endsAt, 'End time');
  if (startsAt.getTime() <= Date.now() || endsAt <= startsAt) throw new BadRequestException('Choose a future start and an end after the start.');
  if (b.status !== 'DRAFT' && b.status !== 'PUBLISHED') throw new BadRequestException('Status must be DRAFT or PUBLISHED.');
  const capacity = integer(b.capacity, 'Capacity', 1, 1000), maxGuestsPerUser = integer(b.maxGuestsPerUser ?? 1, 'Guest allowance', 0, 20);
  if (maxGuestsPerUser >= capacity) throw new BadRequestException('Guest allowance must be smaller than capacity.');
  return {
    title: text(b.title, 'Title'), description: b.description === undefined || b.description === null || b.description === '' ? null : text(b.description, 'Description', 4000),
    locationId: uuid(text(b.locationId, 'Location ID')), startsAt, endsAt, capacity,
    priceCents: integer(b.priceCents, 'Price in cents', 0, 2147483647), currency: 'USD' as const,
    maxGuestsPerUser, cancellationCutoffHours: integer(b.cancellationCutoffHours ?? 12, 'Cancellation cutoff', 0, 8760), status: b.status as 'DRAFT' | 'PUBLISHED'
  };
}
@Controller('api')
export class EventsController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get('health') health() { return { status: 'ok' }; }
  @Get('events') async events() {
    const events = await this.db.event.findMany({
      where: { deletedAt: null, status: 'PUBLISHED', startsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' }, take: 100,
      include: { location: true, signups: { where: { status: { in: ['CONFIRMED', 'WAITLISTED'] } }, select: { status: true } } }
    });
    return events.map(({ signups, ...e }) => ({
      id: e.id, title: e.title, description: e.description, startsAt: e.startsAt, endsAt: e.endsAt,
      priceCents: e.priceCents, currency: e.currency, timezone: e.location.timezone, maxGuestsPerUser: e.maxGuestsPerUser, cancellationCutoffHours: e.cancellationCutoffHours,
      capacity: e.capacity, location: e.location.name, address: e.location.address,
      confirmed: signups.filter(s => s.status === 'CONFIRMED').length, waitlisted: signups.filter(s => s.status === 'WAITLISTED').length
    }));
  }
  @Get('organizer/events') @UseGuards(FirebaseGuard, OrganizerGuard)
  ownEvents(@Req() req: AuthRequest) { return this.db.event.findMany({ where: { deletedAt: null, ...(req.user.role === 'ADMINISTRATOR' ? {} : { organizerId: req.user.id }) }, include: { location: true }, orderBy: { startsAt: 'desc' }, take: 100 }); }
  @Get('locations') @UseGuards(FirebaseGuard, OrganizerGuard)
  locations() { return this.db.location.findMany({ orderBy: { name: 'asc' }, take: 500 }); }
  @Post('events') @UseGuards(FirebaseGuard, OrganizerGuard)
  async create(@Req() req: AuthRequest, @Body() value: unknown) {
    const data = eventInput(value);
    if (!await this.db.location.findUnique({ where: { id: data.locationId } })) throw new BadRequestException('Location does not exist.');
    return this.db.$transaction(async tx => {
      const event = await tx.event.create({ data: { ...data, organizerId: req.user.id } });
      await tx.auditLog.create({ data: { actorId: req.user.id, eventId: event.id, action: 'EVENT_CREATED', details: { status: data.status, priceCents: data.priceCents } } });
      return event;
    });
  }
  @Post('events/:id/publish') @UseGuards(FirebaseGuard, OrganizerGuard)
  async publish(@Req() req: AuthRequest, @Param('id') id: string) {
    uuid(id);
    return this.db.$transaction(async tx => {
      const result = await tx.event.updateMany({ where: { id, deletedAt: null, ...(req.user.role === 'ADMINISTRATOR' ? {} : { organizerId: req.user.id }), status: 'DRAFT', startsAt: { gt: new Date() } }, data: { status: 'PUBLISHED' } });
      if (result.count !== 1) throw new BadRequestException('Only your future draft events can be published.');
      await tx.auditLog.create({ data: { actorId: req.user.id, eventId: id, action: 'EVENT_PUBLISHED', details: {} } });
      return { id, status: 'PUBLISHED' };
    });
  }
}
