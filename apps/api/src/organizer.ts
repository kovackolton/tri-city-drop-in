import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthRequest, FirebaseGuard, OrganizerGuard } from './auth';
import { Database } from './database';
import { object, text, uuid } from './validation';

const reasons = ['LATE_CANCELLATION', 'NO_SHOW', 'MISSED_PAYMENT'] as const;
export function strikeInput(value: unknown) {
  const b = object(value, ['reason', 'note']);
  if (!reasons.includes(b.reason as typeof reasons[number])) throw new BadRequestException('Choose a valid strike reason.');
  return { reason: b.reason as typeof reasons[number], note: text(b.note, 'Review note', 1000) };
}
@Injectable()
export class OrganizerService {
  constructor(@Inject(Database) private readonly db: Database) {}
  private async seat(tx: Prisma.TransactionClient, actorId: string, signupId: string, administrator = false) {
    uuid(signupId);
    const row = await tx.signup.findUnique({ where: { id: signupId }, select: { eventId: true } });
    if (!row) throw new NotFoundException('Seat not found.');
    await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${row.eventId}::uuid FOR UPDATE`;
    const seat = await tx.signup.findUniqueOrThrow({ where: { id: signupId }, include: { event: true, payment: true, strikes: true } });
    if (!administrator && seat.event.organizerId !== actorId) throw new NotFoundException('Seat not found.');
    if (!['PUBLISHED', 'COMPLETED'].includes(seat.event.status)) throw new ConflictException('This event is not available for review.');
    return seat;
  }
  attendance(actorId: string, signupId: string, value: unknown, administrator = false) {
    const b = object(value, ['attendance']);
    if (!['UNMARKED', 'PRESENT', 'ABSENT', 'EXCUSED'].includes(String(b.attendance))) throw new BadRequestException('Choose a valid attendance value.');
    const attendance = b.attendance as 'UNMARKED' | 'PRESENT' | 'ABSENT' | 'EXCUSED';
    return this.db.$transaction(async tx => {
      const seat = await this.seat(tx, actorId, signupId, administrator);
      if (seat.status !== 'CONFIRMED' || seat.event.startsAt > new Date()) throw new ConflictException('Attendance opens at event start for confirmed players.');
      if (attendance === 'ABSENT' && seat.event.endsAt > new Date()) throw new ConflictException('Mark no-shows only after the event ends.');
      if (attendance !== 'ABSENT' && seat.strikes.some(s => s.reason === 'NO_SHOW' && !s.revokedAt)) throw new ConflictException('Revoke the no-show strike before correcting attendance.');
      if (seat.attendance === attendance) return seat;
      const updated = await tx.signup.update({ where: { id: signupId }, data: { attendance } });
      await tx.auditLog.create({ data: { actorId, eventId: seat.eventId, action: 'ATTENDANCE_UPDATED', details: { signupId, previous: seat.attendance, attendance } } });
      return updated;
    });
  }
  issue(actorId: string, signupId: string, value: unknown, administrator = false) {
    const { reason, note } = strikeInput(value);
    return this.db.$transaction(async tx => {
      const seat = await this.seat(tx, actorId, signupId, administrator);
      if (seat.event.endsAt > new Date()) throw new ConflictException('Strike review opens after the event ends.');
      if (reason === 'LATE_CANCELLATION' && !(seat.status === 'CANCELLED' && seat.lateCancellation)) throw new ConflictException('This booking was not a late player cancellation.');
      if (reason === 'NO_SHOW' && !(seat.status === 'CONFIRMED' && seat.attendance === 'ABSENT')) throw new ConflictException('Mark the confirmed player absent before issuing a no-show strike.');
      if (reason === 'MISSED_PAYMENT' && !(seat.status === 'CONFIRMED' && seat.payment && seat.payment.amountCents > 0 && seat.payment.status === 'UNPAID' && seat.payment.playerPaid === false && seat.payment.organizerPaid === false)) throw new ConflictException('Both payment reviews must agree unpaid before a missed-payment strike.');
      const existing = seat.strikes.find(s => s.reason === reason);
      if (existing) {
        if (existing.revokedAt) throw new ConflictException('This incident was already revoked and cannot be reissued.');
        return existing;
      }
      const strike = await tx.strike.create({ data: { userId: seat.userId, signupId, reason, issuedById: actorId } });
      await tx.auditLog.create({ data: { actorId, eventId: seat.eventId, action: 'STRIKE_ISSUED', details: { signupId, strikeId: strike.id, reason, note } } });
      return strike;
    });
  }
  revoke(actorId: string, signupId: string, strikeId: string, value: unknown, administrator = false) {
    uuid(strikeId);
    const note = text(object(value, ['note']).note, 'Revocation note', 1000);
    return this.db.$transaction(async tx => {
      const seat = await this.seat(tx, actorId, signupId, administrator);
      const strike = seat.strikes.find(s => s.id === strikeId);
      if (!strike) throw new NotFoundException('Strike not found.');
      if (strike.revokedAt) return strike;
      const updated = await tx.strike.update({ where: { id: strikeId }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId, eventId: seat.eventId, action: 'STRIKE_REVOKED', details: { signupId, strikeId, note } } });
      return updated;
    });
  }
  async audit(actorId: string, eventId: string, administrator = false) {
    uuid(eventId);
    if (!await this.db.event.findFirst({ where: { id: eventId, ...(administrator ? {} : { organizerId: actorId }) } })) throw new NotFoundException('Event not found.');
    return this.db.auditLog.findMany({ where: { eventId }, select: { id: true, action: true, details: true, createdAt: true, actor: { select: { displayName: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
@Controller('api/organizer') @UseGuards(FirebaseGuard, OrganizerGuard)
export class OrganizerController {
  constructor(@Inject(OrganizerService) private readonly service: OrganizerService) {}
  @Post('signups/:id/attendance') attendance(@Req() req: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.service.attendance(req.user.id, id, b, req.user.role === 'ADMINISTRATOR'); }
  @Post('signups/:id/strikes') issue(@Req() req: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.service.issue(req.user.id, id, b, req.user.role === 'ADMINISTRATOR'); }
  @Post('signups/:id/strikes/:strikeId/revoke') revoke(@Req() req: AuthRequest, @Param('id') id: string, @Param('strikeId') strikeId: string, @Body() b: unknown) { return this.service.revoke(req.user.id, id, strikeId, b, req.user.role === 'ADMINISTRATOR'); }
  @Get('events/:id/audit') audit(@Req() req: AuthRequest, @Param('id') id: string) { return this.service.audit(req.user.id, id, req.user.role === 'ADMINISTRATOR'); }
}
