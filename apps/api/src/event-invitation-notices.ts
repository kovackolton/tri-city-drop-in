import { Event, Prisma } from '@prisma/client';
export async function notifyInvitations(tx: Prisma.TransactionClient, event: Event) {
  if (event.status !== 'PUBLISHED') return;
  const invitations = await tx.eventInvitation.findMany({ where: { eventId: event.id, status: 'PENDING' } });
  if (invitations.length) await tx.notification.createMany({ skipDuplicates: true, data: invitations.map(invitation => ({ userId: invitation.userId, kind: 'EVENT_INVITATION', dedupeKey: `event-invitation:${invitation.id}`, payload: { eventId: event.id, invitationId: invitation.id, title: `Invitation: ${event.title}` } })) });
}
