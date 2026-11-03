import { Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthRequest, FirebaseGuard, OrganizerGuard } from './auth';
import { Database } from './database';
import { integer, object, uuid } from './validation';
import { appearance, appearanceSelect } from './profile-fields';
export function balanceTeams(players: { id: string; rating: number | null }[], count: number) {
  const teams = Array.from({ length: count }, (_, index) => ({ number: index + 1, ids: [] as string[], total: 0 }));
  for (const player of [...players].sort((a, b) => (b.rating ?? 3) - (a.rating ?? 3) || a.id.localeCompare(b.id))) {
    const team = [...teams].sort((a, b) => a.ids.length - b.ids.length || a.total - b.total || a.number - b.number)[0];
    team.ids.push(player.id); team.total += player.rating ?? 3;
  }
  return teams;
}
@Injectable()
export class TeamsService {
  constructor(@Inject(Database) private readonly db: Database) {}
  private async locked(tx: Prisma.TransactionClient, actorId: string, id: string, administrator: boolean) {
    uuid(id);
    await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const event = await tx.event.findUnique({ where: { id } });
    if (!event || event.deletedAt || !administrator && event.organizerId !== actorId) throw new NotFoundException('Event not found.');
    if (!['DRAFT', 'PUBLISHED'].includes(event.status) || event.endsAt <= new Date()) throw new ConflictException('Team changes are available only before the event ends.');
    return event;
  }
  async data(actorId: string, id: string, administrator = false) {
    uuid(id);
    const event = await this.db.event.findFirst({ where: { id, deletedAt: null, ...(administrator ? {} : { organizerId: actorId }) } });
    if (!event) throw new NotFoundException('Event not found.');
    const seats = await this.db.signup.findMany({ where: { eventId: id, status: 'CONFIRMED' }, select: { id: true, teamNumber: true, guestName: true, guestNumber: true, user: { select: { ...appearanceSelect, skillLevel: true } } }, orderBy: [{ queuedAt: 'asc' }, { guestNumber: 'asc' }, { id: 'asc' }] });
    return { teamCount: event.teamCount, teamBalancingEnabled: event.teamBalancingEnabled, editable: ['DRAFT', 'PUBLISHED'].includes(event.status) && event.endsAt > new Date(), players: seats.map(seat => ({ id: seat.id, ...appearance(seat.user), displayName: seat.guestNumber ? seat.guestName : appearance(seat.user).displayName, avatarUrl: seat.guestNumber ? null : appearance(seat.user).avatarUrl, accountName: seat.user.displayName, isGuest: seat.guestNumber > 0, rating: seat.guestNumber ? null : seat.user.skillLevel, teamNumber: seat.teamNumber })) };
  }
  async settings(actorId: string, id: string, value: unknown, administrator = false) {
    const b = object(value, ['teamCount', 'teamBalancingEnabled']);
    const teamCount = integer(b.teamCount, 'Number of teams', 2, 16);
    if (typeof b.teamBalancingEnabled !== 'boolean') throw new ConflictException('Choose whether rating-based balancing is enabled.');
    const enabled = b.teamBalancingEnabled;
    return this.db.$transaction(async tx => {
      await this.locked(tx, actorId, id, administrator);
      await tx.event.update({ where: { id }, data: { teamCount, teamBalancingEnabled: enabled } });
      await tx.signup.updateMany({ where: { eventId: id, teamNumber: { gt: teamCount } }, data: { teamNumber: null } });
      await tx.auditLog.create({ data: { actorId, eventId: id, action: 'TEAM_SETTINGS_CHANGED', details: { teamCount, teamBalancingEnabled: enabled } } });
      return { teamCount, teamBalancingEnabled: enabled };
    });
  }
  async assign(actorId: string, id: string, value: unknown, administrator = false) {
    const b = object(value, ['signupId', 'teamNumber']);
    const signupId = uuid(typeof b.signupId === 'string' ? b.signupId : '');
    return this.db.$transaction(async tx => {
      const event = await this.locked(tx, actorId, id, administrator);
      const teamNumber = b.teamNumber === null ? null : integer(b.teamNumber, 'Team', 1, event.teamCount);
      const seat = await tx.signup.findFirst({ where: { id: signupId, eventId: id, status: 'CONFIRMED' } });
      if (!seat) throw new NotFoundException('Confirmed seat not found.');
      if (seat.teamNumber === teamNumber) return seat;
      const updated = await tx.signup.update({ where: { id: signupId }, data: { teamNumber } });
      await tx.auditLog.create({ data: { actorId, eventId: id, action: 'TEAM_PLAYER_ASSIGNED', details: { signupId, previous: seat.teamNumber, teamNumber } } });
      return updated;
    });
  }
  async balance(actorId: string, id: string, administrator = false) {
    return this.db.$transaction(async tx => {
      const event = await this.locked(tx, actorId, id, administrator);
      if (!event.teamBalancingEnabled) throw new ConflictException('Enable rating-based team balancing first.');
      const seats = await tx.signup.findMany({ where: { eventId: id, status: 'CONFIRMED' }, select: { id: true, guestNumber: true, user: { select: { skillLevel: true } } } });
      const teams = balanceTeams(seats.map(seat => ({ id: seat.id, rating: seat.guestNumber ? null : seat.user.skillLevel })), event.teamCount);
      for (const team of teams) if (team.ids.length) await tx.signup.updateMany({ where: { id: { in: team.ids } }, data: { teamNumber: team.number } });
      await tx.auditLog.create({ data: { actorId, eventId: id, action: 'TEAMS_AUTO_BALANCED', details: { neutralRating: 3, teams } } });
      return teams.map(team => ({ number: team.number, count: team.ids.length }));
    }, { maxWait: 10000, timeout: 15000 });
  }
}
@Controller('api/organizer/events/:id/teams') @UseGuards(FirebaseGuard, OrganizerGuard)
export class TeamsController {
  constructor(@Inject(TeamsService) private readonly service: TeamsService) {}
  @Get() data(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.data(req.user.id, id, req.user.role === 'ADMINISTRATOR'); }
  @Post('settings') settings(@Req() req: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.service.settings(req.user.id, id, b, req.user.role === 'ADMINISTRATOR'); }
  @Post('assign') assign(@Req() req: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.service.assign(req.user.id, id, b, req.user.role === 'ADMINISTRATOR'); }
  @Post('balance') balance(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.balance(req.user.id, id, req.user.role === 'ADMINISTRATOR'); }
}
