import { Body, ConflictException, Controller, ForbiddenException, Get, Inject, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AdministratorGuard, AuthRequest, FirebaseGuard } from './auth';
import { Database } from './database';
import { object, text, uuid } from './validation';
import { currentStrikes, refreshPaymentStrikes, strikeLimit } from './strike-policy';
@Injectable()
export class StrikesService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async report(userId: string) {
    uuid(userId); await refreshPaymentStrikes(this.db, [userId]);
    const [current, rows] = await Promise.all([
      this.db.strike.findMany({ where: { ...currentStrikes(), userId }, select: { id: true } }),
      this.db.strike.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: {
        id: true, reason: true, note: true, permanent: true, automatic: true, createdAt: true, revokedAt: true, expiresAt: true,
        signup: { select: { id: true, bookingId: true, status: true, guestNumber: true, guestName: true, subName: true, subResponsibilityAcknowledgedAt: true, event: { select: { id: true, title: true, startsAt: true, endsAt: true, location: { select: { name: true, address: true, timezone: true } }, organizerContactEmail: true, organizerContactPhone: true, contactCallAllowed: true, contactTextAllowed: true } }, payment: { select: { amountCents: true, playerPaid: true, organizerPaid: true, playerReviewedAt: true, organizerReviewedAt: true } } } }
      } })
    ]);
    const ids = new Set(current.map(strike => strike.id));
    return { count: ids.size, limit: strikeLimit, blocked: ids.size >= strikeLimit, items: rows.map(row => ({ ...row, current: ids.has(row.id) })) };
  }
  async permanent(actorId: string, userId: string, value: unknown) {
    uuid(userId); const b = object(value, ['note', 'requestId']); const note = text(b.note, 'Permanent strike reason', 1000); const requestId = uuid(typeof b.requestId === 'string' ? b.requestId : '');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${actorId}::uuid, ${userId}::uuid) ORDER BY "id" FOR UPDATE`;
      if ((await tx.user.findUnique({ where: { id: actorId }, select: { role: true } }))?.role !== 'ADMINISTRATOR') throw new ForbiddenException('Administrator access required.');
      if (!await tx.user.findUnique({ where: { id: userId } })) throw new NotFoundException('User not found.');
      const existing = await tx.strike.findUnique({ where: { adminRequestId: requestId } });
      if (existing) { if (existing.userId !== userId || existing.issuedById !== actorId || existing.note !== note) throw new ConflictException('This strike request was already used.'); return existing; }
      const strike = await tx.strike.create({ data: { userId, issuedById: actorId, reason: 'ADMIN_PERMANENT', permanent: true, note, adminRequestId: requestId } });
      await tx.auditLog.create({ data: { actorId, action: 'ADMIN_PERMANENT_STRIKE', details: { userId, strikeId: strike.id, note } } });
      await tx.notification.create({ data: { userId, kind: 'ADMIN_PERMANENT_STRIKE', dedupeKey: `strike:${strike.id}`, payload: { title: 'Permanent administrator strike', note } } });
      return strike;
    });
  }
  async revokePermanent(actorId: string, userId: string, id: string, value: unknown) {
    uuid(userId); uuid(id); const note = text(object(value, ['note']).note, 'Revocation reason', 1000);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${actorId}::uuid, ${userId}::uuid) ORDER BY "id" FOR UPDATE`;
      if ((await tx.user.findUnique({ where: { id: actorId }, select: { role: true } }))?.role !== 'ADMINISTRATOR') throw new ForbiddenException('Administrator access required.');
      const strike = await tx.strike.findFirst({ where: { id, userId, permanent: true } });
      if (!strike) throw new NotFoundException('Permanent strike not found.');
      if (strike.revokedAt) return strike;
      const result = await tx.strike.update({ where: { id }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId, action: 'ADMIN_PERMANENT_STRIKE_REVOKED', details: { userId, strikeId: id, note } } });
      await tx.notification.create({ data: { userId, kind: 'STRIKE_CLEARED', dedupeKey: `strike-cleared:${id}`, payload: { title: 'Administrator strike cleared' } } });
      return result;
    });
  }
}
@Controller('api/me/strikes') @UseGuards(FirebaseGuard)
export class MyStrikesController {
  constructor(@Inject(StrikesService) private readonly service: StrikesService) {}
  @Get() report(@Req() req: AuthRequest) { return this.service.report(req.user.id); }
}
@Controller('api/admin/users') @UseGuards(FirebaseGuard, AdministratorGuard)
export class AdminStrikesController {
  constructor(@Inject(StrikesService) private readonly service: StrikesService) {}
  @Get(':id/strikes') report(@Param('id') id: string) { return this.service.report(id); }
  @Post(':id/strikes') permanent(@Req() req: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.service.permanent(req.user.id, id, b); }
  @Post(':id/strikes/:strikeId/revoke') revoke(@Req() req: AuthRequest, @Param('id') id: string, @Param('strikeId') strikeId: string, @Body() b: unknown) { return this.service.revokePermanent(req.user.id, id, strikeId, b); }
}
