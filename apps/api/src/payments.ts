import { BadRequestException, Body, ConflictException, Controller, Inject, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthRequest, FirebaseGuard, OrganizerGuard } from './auth';
import { Database } from './database';
import { syncEventPaymentStrikes } from './strike-policy';
import { object, uuid } from './validation';

export function paymentReviewInput(value: unknown) {
  const body = object(value, ['paid']);
  if (typeof body.paid !== 'boolean') throw new BadRequestException('Paid must be true or false.');
  return body.paid;
}

@Injectable()
export class PaymentsService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async review(actorId: string, signupId: string, side: 'player' | 'organizer', value: unknown, administrator = false) {
    uuid(signupId);
    const paid = paymentReviewInput(value);
    return this.db.$transaction(async tx => {
      const seat = await tx.signup.findUnique({ where: { id: signupId }, select: { eventId: true } });
      if (!seat) throw new NotFoundException('Payment record not found.');
      // Same event lock as registration writes: no cancelled seat can be reviewed mid-change.
      await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${seat.eventId}::uuid FOR UPDATE`;
      const signup = await tx.signup.findUniqueOrThrow({ where: { id: signupId }, include: { event: true, payment: true } });
      if (side === 'player' ? signup.userId !== actorId : !administrator && signup.event.organizerId !== actorId) throw new NotFoundException('Payment record not found.');
      if (signup.status !== 'CONFIRMED' || !['PUBLISHED', 'COMPLETED'].includes(signup.event.status)) throw new ConflictException('Only confirmed places at an active or completed event can be reviewed.');
      if (signup.event.endsAt > new Date()) throw new ConflictException('Pay in person at the event. Payment review opens after the event ends.');
      const payment = signup.payment;
      if (!payment || payment.amountCents === 0 || payment.status === 'VOID') throw new ConflictException('This seat does not require a payment review.');
      const oldPaid = side === 'player' ? payment.playerPaid : payment.organizerPaid;
      if (oldPaid === paid) { if (side === 'organizer') await syncEventPaymentStrikes(tx, signup.eventId); return payment; } // Identical retries preserve the timestamp and audit history.
      const now = new Date();
      const updated = await tx.paymentObligation.update({ where: { id: payment.id }, data: side === 'player'
        ? { playerPaid: paid, playerReviewedAt: now }
        : { organizerPaid: paid, organizerReviewedAt: now, organizerReviewedById: actorId, status: paid ? 'PAID' : 'UNPAID' } });
      if (side === 'organizer' && updated.organizerPaid === true) {
        const strikes = await tx.strike.findMany({ where: { signupId, reason: 'MISSED_PAYMENT', revokedAt: null } });
        for (const strike of strikes) {
          await tx.strike.update({ where: { id: strike.id }, data: { revokedAt: now } });
          await tx.notification.create({ data: { userId: signup.userId, kind: 'STRIKE_CLEARED', dedupeKey: `strike-cleared:${strike.id}:${now.getTime()}`, payload: { eventId: signup.eventId, title: `Payment strike cleared: ${signup.event.title}` } } });
          await tx.auditLog.create({ data: { actorId, eventId: signup.eventId, action: 'STRIKE_REVOKED', details: { signupId, strikeId: strike.id, note: 'Organizer confirmed payment received.' } } });
        }
      }
      await tx.auditLog.create({ data: { actorId, eventId: signup.eventId, action: side === 'player' ? 'PLAYER_PAYMENT_REVIEW' : 'ORGANIZER_PAYMENT_REVIEW', details: { signupId, paymentId: payment.id, previousPaid: oldPaid, paid } } });
      if (side === 'organizer') await syncEventPaymentStrikes(tx, signup.eventId);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 15000 });
  }
}

@Controller('api/signups') @UseGuards(FirebaseGuard)
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}
  @Post(':id/payment/player-review')
  player(@Req() req: AuthRequest, @Param('id') id: string, @Body() value: unknown) { return this.payments.review(req.user.id, id, 'player', value); }
  @Post(':id/payment/organizer-review') @UseGuards(OrganizerGuard)
  organizer(@Req() req: AuthRequest, @Param('id') id: string, @Body() value: unknown) { return this.payments.review(req.user.id, id, 'organizer', value, req.user.role === 'ADMINISTRATOR'); }
}
