import { BadRequestException } from '@nestjs/common';
import { integer } from './validation';
import { profileInput } from './profile-fields';
export interface EventOptions { teamCount: number; teamBalancingEnabled: boolean; organizerContactEmail: string | null; organizerContactPhone: string | null; contactCallAllowed: boolean; contactTextAllowed: boolean; }
export function eventOptionsInput(b: Record<string, unknown>, previous?: EventOptions): EventOptions {
  for (const key of ['teamBalancingEnabled', 'contactCallAllowed', 'contactTextAllowed']) if (b[key] !== undefined && typeof b[key] !== 'boolean') throw new BadRequestException(`${key} must be a checkbox value.`);
  const email = b.organizerContactEmail === undefined ? previous?.organizerContactEmail ?? null : profileInput({ contactEmail: b.organizerContactEmail }).contactEmail ?? null;
  const phone = b.organizerContactPhone === undefined ? previous?.organizerContactPhone ?? null : profileInput({ phone: b.organizerContactPhone }).phone ?? null;
  const call = b.contactCallAllowed === undefined ? previous?.contactCallAllowed ?? false : b.contactCallAllowed as boolean;
  const sms = b.contactTextAllowed === undefined ? previous?.contactTextAllowed ?? false : b.contactTextAllowed as boolean;
  if ((call || sms) && !phone) throw new BadRequestException('Enter the organizer phone number for call/text availability.');
  if (phone && !call && !sms) throw new BadRequestException('Select call and/or text for the organizer phone number.');
  return { teamCount: b.teamCount === undefined ? previous?.teamCount ?? 2 : integer(b.teamCount, 'Number of teams', 2, 16), teamBalancingEnabled: b.teamBalancingEnabled === undefined ? previous?.teamBalancingEnabled ?? false : b.teamBalancingEnabled as boolean, organizerContactEmail: email, organizerContactPhone: phone, contactCallAllowed: call, contactTextAllowed: sms };
}
export function initialPlayersInput(b: Record<string, unknown>) {
  if (b.initialPlayerIds !== undefined && (!Array.isArray(b.initialPlayerIds) || b.initialPlayerIds.length > 100)) throw new BadRequestException('Select up to 100 existing players.');
  const ids = (b.initialPlayerIds ?? []) as unknown[];
  if (ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new BadRequestException('Choose valid existing players.');
  if (new Set(ids).size !== ids.length) throw new BadRequestException('Each player can be selected only once.');
  if (b.initialPlayerMode !== undefined && !['INVITE', 'BOOK'].includes(b.initialPlayerMode as string)) throw new BadRequestException('Choose invite or immediate booking.');
  return { ids: ids as string[], mode: (b.initialPlayerMode ?? 'INVITE') as 'INVITE' | 'BOOK' };
}
