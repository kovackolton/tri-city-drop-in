import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Database } from './database';
import { AuthRequest, FirebaseGuard } from './auth';
import { object } from './validation';
// Published text is immutable: change the version whenever these terms change.
export const waiverVersion = 'participation-strikes-v1';
export const waiverTitle = 'Participation and strike rules waiver';
export const waiverClauses = [
  'I accept the event price when booking and am responsible for payment for my seat and every guest seat I book. Payments are made in person. I must separately acknowledge guest payment responsibility when adding guests.',
  'After an event ends, I can report I paid or I have not paid for each applicable seat. If more than 24 hours pass without a player payment report, the app provides an in-app reminder, grouped by booking and including guests. Either answer completes that player report. Reminders are checked when the app refreshes; they are not external messages.',
  'Payment strikes have a 24-hour grace period after the event ends. After that period, each confirmed fee-bearing seat explicitly marked Not received by the organizer receives one payment strike against its booking account. Each unpaid guest seat counts separately. Free seats, voided obligations, waitlisted seats and cancelled seats/events do not receive payment strikes.',
  'An event with no organizer payment reviews produces no payment strikes. Unreviewed players never receive payment strikes, even if the organizer starts reviewing other players. A late organizer unpaid review applies the eligible strike immediately. Earlier unpaid reviews are reconciled on relevant app refreshes and before new bookings.',
  'My own payment report is information for the organizer and may identify a disagreement. My I paid report does not prevent or clear an organizer-marked unpaid strike. I will contact the organizer to resolve payment discrepancies. When the organizer confirms payment received, that payment strike clears, regardless of my report. Correcting the organizer review back to unpaid reapplies the same seat strike after the grace period. Generic strike revocation cannot bypass organizer payment confirmation.',
  'Organizers may also issue reviewed no-show and late-cancellation strikes when the recorded incident qualifies. Guests\' strikes apply to their booking account. These incidents require a review and note, can be corrected through the existing review process, and count equally with current payment strikes.',
  'Administrators may issue permanent strikes at their discretion with a recorded reason I can see in My profile. Permanent strikes do not expire and do not clear when I pay for an event. Only an administrator can correct or revoke a permanent strike, with an audit reason. Every current strike has equal weight.',
  'At three or more current strikes, I cannot make any new game booking, including free games, waitlists, invitation acceptance and organizer-created bookings for me. My existing bookings remain in place, including existing waitlist entries, and I can still cancel them. Revoked or expired strikes do not count. Once my count falls below three, I can make new bookings if I have accepted the current waiver.',
  'My profile lists strike reasons and relevant event, guest-seat and payment-report details. Organizers and administrators can see current account strike counts in player management; administrators can also see them in Users. I can use My profile and organizer contact details to resolve a payment issue, and contact an administrator about permanent strikes.',
  'By pressing I agree while signed in, I electronically sign this version of the participation and strike rules waiver for my account. The app records the exact text, version, content hash, account name/email snapshot and server acceptance time. Acceptance is required before any new booking; declining leaves browsing, payment review, profile access and existing bookings available. A future published version requires a new acceptance.'
] as const;
export const waiverText = [waiverTitle, waiverVersion, ...waiverClauses].join('\n\n');
export const waiverHash = createHash('sha256').update(waiverText).digest('hex');
@Injectable()
export class WaiverService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async status(userId: string) {
    const acceptance = await this.db.waiverAcceptance.findUnique({ where: { userId_version: { userId, version: waiverVersion } } });
    return { version: waiverVersion, title: waiverTitle, clauses: waiverClauses, contentHash: waiverHash, acceptance: acceptance?.contentHash === waiverHash ? { id: acceptance.id, version: acceptance.version, signedName: acceptance.signedName, signedEmail: acceptance.signedEmail, acceptedAt: acceptance.acceptedAt } : null };
  }
  async accept(userId: string, value: unknown) {
    const b = object(value, ['version', 'agree']);
    if (b.agree !== true) throw new BadRequestException('Press I agree to electronically sign the waiver.');
    if (b.version !== waiverVersion) throw new ConflictException('The waiver version changed. Refresh and review the current waiver before agreeing.');
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const existing = await tx.waiverAcceptance.findUnique({ where: { userId_version: { userId, version: waiverVersion } } });
      if (existing) { if (existing.contentHash !== waiverHash) throw new ConflictException('Waiver text changed without a new version. Contact the administrator.'); return; }
      const acceptance = await tx.waiverAcceptance.create({ data: { userId, version: waiverVersion, contentHash: waiverHash, contentText: waiverText, signedName: user.displayName, signedEmail: user.email } });
      await tx.auditLog.create({ data: { actorId: userId, action: 'PARTICIPATION_WAIVER_ACCEPTED', details: { acceptanceId: acceptance.id, version: waiverVersion, contentHash: waiverHash } } });
    });
    return this.status(userId);
  }
}
@Controller('api/me/waiver') @UseGuards(FirebaseGuard)
export class WaiverController {
  constructor(@Inject(WaiverService) private readonly service: WaiverService) {}
  @Get() status(@Req() req: AuthRequest) { return this.service.status(req.user.id); }
  @Post() accept(@Req() req: AuthRequest, @Body() value: unknown) { return this.service.accept(req.user.id, value); }
}
