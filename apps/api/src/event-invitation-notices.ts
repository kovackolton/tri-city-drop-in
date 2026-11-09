import { eligibleForEvent } from './event-eligibility';
import { Event, Prisma } from '@prisma/client';
export async function notifyInvitations(tx: Prisma.TransactionClient, event: Event, userId?: string | string[]) {
  if (event.status !== 'PUBLISHED') return;
  const invitations = await tx.eventInvitation.findMany({ where: { eventId: event.id, status: 'PENDING', ...(userId ? { userId: Array.isArray(userId) ? { in: userId } : userId } : {}) }, include: { user: { select: { skillLevel: true, adminSkillLevel: true } } } });
  for (const invitation of invitations) {
    if (!eligibleForEvent(event, invitation.user)) continue;
    const payload = { eventId: event.id, invitationId: invitation.id, title: `Invitation: ${event.title}` };
    await tx.notification.upsert({ where: { dedupeKey: `event-invitation:${invitation.id}` }, update: { readAt: null, payload }, create: { userId: invitation.userId, kind: 'EVENT_INVITATION', dedupeKey: `event-invitation:${invitation.id}`, payload } });
  }
}
