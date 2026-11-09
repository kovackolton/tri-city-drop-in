import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { uuid } from './validation';
import { appearance, appearanceSelect } from './profile-fields';
export function managesEvent(event: { organizerId: string; coOrganizerIds?: string[] }, actorId: string) { return event.organizerId === actorId || !!event.coOrganizerIds?.includes(actorId); }
export function managedEvents(actorId: string): Prisma.EventWhereInput { return { OR: [{ organizerId: actorId }, { coOrganizerIds: { has: actorId } }] }; }
export function coOrganizerInput(value: unknown, previous: string[] = []) {
  if (value === undefined) return [...previous];
  if (!Array.isArray(value) || value.length > 20) throw new BadRequestException('Select up to 20 additional organizers.');
  const ids = value.map(id => uuid(typeof id === 'string' ? id : '').toLowerCase());
  if (new Set(ids).size !== ids.length) throw new BadRequestException('Select each organizer only once.');
  return ids.sort();
}
export async function validateOrganizers(tx: Prisma.TransactionClient, ids: string[], primaryId: string) {
  if (ids.includes(primaryId)) throw new BadRequestException('The creator is already the primary organizer.');
  if (await tx.user.count({ where: { id: { in: ids }, role: { in: ['ORGANIZER', 'ADMINISTRATOR'] } } }) !== ids.length) throw new BadRequestException('Select existing organizers or administrators. Refresh the selection.');
}
export async function organizerDirectory(tx: Pick<Prisma.TransactionClient, 'user'>, ids: string[]) {
  if (!ids.length) return [];
  return tx.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, ...appearanceSelect }, orderBy: [{ displayName: 'asc' }, { id: 'asc' }] }).then(users => users.map(user => ({ id: user.id, ...appearance(user), accountName: user.displayName })));
}
export async function notifyOrganizerChanges(tx: Prisma.TransactionClient, event: { id: string; title: string; coOrganizerIds: string[] }, previous: string[] = []) {
  for (const id of new Set([...previous, ...event.coOrganizerIds])) {
    const added = event.coOrganizerIds.includes(id); if (added === previous.includes(id)) continue;
    await tx.notification.create({ data: { userId: id, dedupeKey: `event-organizer:${event.id}:${id}:${randomUUID()}`, kind: added ? 'EVENT_ORGANIZER_ADDED' : 'EVENT_ORGANIZER_REMOVED', payload: { eventId: event.id, title: event.title } } });
  }
}
