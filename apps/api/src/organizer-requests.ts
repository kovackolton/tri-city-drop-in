import { BadRequestException, ConflictException, ForbiddenException, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdministratorGuard, AuthRequest, FirebaseGuard } from './auth';
import { Database } from './database';
import { appearanceSelect, appearance } from './profile-fields';
import { uuid } from './validation';

@Injectable()
export class OrganizerRequestsService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async mine(userId: string) {
    return this.db.organizerRequest.findFirst({ where: { userId }, orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], select: { id: true, status: true, requestedAt: true, reviewedAt: true } });
  }
  async request(userId: string) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.role !== 'PLAYER') throw new ConflictException('You already have organizer access.');
      const pending = await tx.organizerRequest.findFirst({ where: { userId, status: 'PENDING' } });
      if (pending) return pending;
      const request = await tx.organizerRequest.create({ data: { userId } });
      const admins = await tx.user.findMany({ where: { role: 'ADMINISTRATOR' }, select: { id: true } });
      if (admins.length) await tx.notification.createMany({ data: admins.map(admin => ({ userId: admin.id, kind: 'ORGANIZER_REQUEST', dedupeKey: `organizer-request:${request.id}:${admin.id}`, payload: { requestId: request.id, requesterId: userId, title: `${user.displayName} requested organizer access` } })) });
      return request;
    }, { maxWait: 10000, timeout: 15000 });
  }
  async users(search = '', pending = false, cursor?: string) {
    if (typeof search !== 'string' || search.length > 80) throw new BadRequestException('Search must be at most 80 characters.');
    if (cursor) { if (typeof cursor !== 'string') throw new BadRequestException('Use a valid user cursor.'); uuid(cursor); }
    const where = {
      ...(pending ? { organizerRequests: { some: { status: 'PENDING' } } } : {}),
      ...(search.trim() ? { OR: ['displayName', 'nickname', 'email'].map(field => ({ [field]: { contains: search.trim(), mode: 'insensitive' as const } })) } : {})
    };
    const [users, pendingCount] = await this.db.$transaction([
      this.db.user.findMany({ where, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 51, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, ...appearanceSelect, email: true, role: true, contactEmail: true, phone: true, skillLevel: true, organizerRequests: { where: { status: 'PENDING' }, select: { id: true, requestedAt: true }, take: 1 } } }),
      this.db.organizerRequest.count({ where: { status: 'PENDING' } })
    ]);
    const page = users.slice(0, 50);
    return { pendingCount, nextCursor: users.length > 50 ? page[49].id : null, items: page.map(user => ({ id: user.id, ...appearance(user), accountName: user.displayName, nickname: user.nickname, email: user.email, contactEmail: user.contactEmail ?? user.email, phone: user.phone, role: user.role, skillLevel: user.skillLevel, organizerRequest: user.organizerRequests[0] ?? null })) };
  }
  async review(actorId: string, id: string, action: 'grant' | 'clear') {
    uuid(id);
    return this.db.$transaction(async tx => {
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
      if (actor?.role !== 'ADMINISTRATOR') throw new ForbiddenException('Administrator access required.');
      const initial = await tx.organizerRequest.findUnique({ where: { id } });
      if (!initial) throw new NotFoundException('Request not found.');
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${initial.userId}::uuid FOR UPDATE`;
      const request = await tx.organizerRequest.findUniqueOrThrow({ where: { id } });
      const target = action === 'grant' ? 'GRANTED' : 'CLEARED';
      if (request.status === target) return request;
      if (request.status !== 'PENDING') throw new ConflictException('This request has already been reviewed. Refresh the user list.');
      const user = await tx.user.findUniqueOrThrow({ where: { id: request.userId } });
      if (action === 'grant') {
        if (user.role !== 'PLAYER') throw new ConflictException('This user already has organizer access. Clear the pending request instead.');
        await tx.user.update({ where: { id: user.id }, data: { role: 'ORGANIZER' } });
      }
      const now = new Date();
      const updated = await tx.organizerRequest.update({ where: { id }, data: { status: target, reviewedAt: now, reviewedById: actorId } });
      await tx.notification.updateMany({ where: { kind: 'ORGANIZER_REQUEST', payload: { path: ['requestId'], equals: id }, readAt: null }, data: { readAt: now } });
      await tx.notification.create({ data: { userId: user.id, kind: `ORGANIZER_REQUEST_${target}`, dedupeKey: `organizer-outcome:${id}`, payload: { title: action === 'grant' ? 'Organizer access granted' : 'Organizer request cleared', requestId: id } } });
      return updated;
    }, { maxWait: 10000, timeout: 15000 });
  }
}
@Controller('api/me/organizer-request') @UseGuards(FirebaseGuard)
export class OrganizerRequestsController {
  constructor(@Inject(OrganizerRequestsService) private readonly service: OrganizerRequestsService) {}
  @Get() mine(@Req() req: AuthRequest) { return this.service.mine(req.user.id); }
  @Post() request(@Req() req: AuthRequest) { return this.service.request(req.user.id); }
}
@Controller('api/admin') @UseGuards(FirebaseGuard, AdministratorGuard)
export class AdminUsersController {
  constructor(@Inject(OrganizerRequestsService) private readonly service: OrganizerRequestsService) {}
  @Get('users') users(@Query('search') search?: string, @Query('pending') pending?: string, @Query('cursor') cursor?: string) {
    if (pending !== undefined && !['true', 'false'].includes(pending)) throw new BadRequestException('Pending must be true or false.');
    return this.service.users(search, pending === 'true', cursor);
  }
  @Post('organizer-requests/:id/grant') grant(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.review(req.user.id, id, 'grant'); }
  @Post('organizer-requests/:id/clear') clear(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.review(req.user.id, id, 'clear'); }
}
