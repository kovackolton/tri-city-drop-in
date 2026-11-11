import { paymentProfileUrl, PaymentMethod, zelleRecipient } from './payment-links';
import { BadRequestException } from '@nestjs/common';
import { integer } from './validation';
import { profileInput } from './profile-fields';
export interface EventOptions { organizerVenmoUrl?: string | null; organizerCashAppUrl?: string | null; organizerPaypalUrl?: string | null; organizerZelleContact?: string | null; teamCount: number; teamBalancingEnabled: boolean; organizerContactEmail: string | null; organizerContactPhone: string | null; contactCallAllowed: boolean; contactTextAllowed: boolean; }
export function eventOptionsInput(b: Record<string, unknown>, previous?: EventOptions): EventOptions {
  for (const key of ['teamBalancingEnabled', 'contactCallAllowed', 'contactTextAllowed']) if (b[key] !== undefined && typeof b[key] !== 'boolean') throw new BadRequestException(`${key} must be a checkbox value.`);
  const email = b.organizerContactEmail === undefined ? previous?.organizerContactEmail ?? null : profileInput({ contactEmail: b.organizerContactEmail }).contactEmail ?? null;
  const phone = b.organizerContactPhone === undefined ? previous?.organizerContactPhone ?? null : profileInput({ phone: b.organizerContactPhone }).phone ?? null;
  const call = b.contactCallAllowed === undefined ? previous?.contactCallAllowed ?? false : b.contactCallAllowed as boolean;
  const sms = b.contactTextAllowed === undefined ? previous?.contactTextAllowed ?? false : b.contactTextAllowed as boolean;
  if ((call || sms) && !phone) throw new BadRequestException('Enter the organizer phone number for call/text availability.');
  if (phone && !call && !sms) throw new BadRequestException('Select call and/or text for the organizer phone number.');
  const paymentLink = (field: 'organizerVenmoUrl' | 'organizerCashAppUrl' | 'organizerPaypalUrl', method: PaymentMethod, example: string) => {
    if (b[field] === undefined) return previous?.[field] ?? null;
    if (b[field] === null || typeof b[field] === 'string' && !(b[field] as string).trim()) return null;
    const url = paymentProfileUrl(b[field], method);
    if (!url) throw new BadRequestException(`Enter a valid ${method === 'cashapp' ? 'Cash App' : method === 'paypal' ? 'PayPal' : 'Venmo'} profile link, for example ${example}.`);
    return url;
  };
  let zelle = previous?.organizerZelleContact ?? null;
  if (b.organizerZelleContact !== undefined) {
    const value = b.organizerZelleContact;
    zelle = value === null || typeof value === 'string' && !value.trim() ? null : zelleRecipient(value);
    if (zelle === null && value !== null && !(typeof value === 'string' && !value.trim())) throw new BadRequestException('Enter a valid Zelle email address or U.S. mobile number.');
  }
  return { organizerZelleContact: zelle, organizerVenmoUrl: paymentLink('organizerVenmoUrl', 'venmo', 'https://venmo.com/u/YourUsername'), organizerCashAppUrl: paymentLink('organizerCashAppUrl', 'cashapp', 'https://cash.app/$YourCashtag'), organizerPaypalUrl: paymentLink('organizerPaypalUrl', 'paypal', 'https://paypal.me/YourUsername'), teamCount: b.teamCount === undefined ? previous?.teamCount ?? 2 : integer(b.teamCount, 'Number of teams', 2, 16), teamBalancingEnabled: b.teamBalancingEnabled === undefined ? previous?.teamBalancingEnabled ?? false : b.teamBalancingEnabled as boolean, organizerContactEmail: email, organizerContactPhone: phone, contactCallAllowed: call, contactTextAllowed: sms };
}
export function initialPlayersInput(b: Record<string, unknown>) {
  if (b.initialPlayerIds !== undefined && (!Array.isArray(b.initialPlayerIds) || b.initialPlayerIds.length > 100)) throw new BadRequestException('Select up to 100 existing players.');
  const ids = (b.initialPlayerIds ?? []) as unknown[];
  if (ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new BadRequestException('Choose valid existing players.');
  if (new Set(ids).size !== ids.length) throw new BadRequestException('Each player can be selected only once.');
  if (b.initialPlayerMode !== undefined && !['INVITE', 'BOOK'].includes(b.initialPlayerMode as string)) throw new BadRequestException('Choose invite or immediate booking.');
  return { ids: ids as string[], mode: (b.initialPlayerMode ?? 'INVITE') as 'INVITE' | 'BOOK' };
}

export interface PlayerSelection { userId: string; mode: 'INVITE' | 'BOOK'; }
export function playerSelections(value: unknown): PlayerSelection[] {
  if (!Array.isArray(value) || value.length > 100) throw new BadRequestException('Select up to 100 existing players.');
  const players = value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['userId', 'mode'].includes(key))) throw new BadRequestException('Choose a valid player and how to add them.');
    const entry = item as Record<string, unknown>;
    if (typeof entry.userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.userId) || !['INVITE', 'BOOK'].includes(entry.mode as string)) throw new BadRequestException('Choose a valid player and invitation or booking.');
    return { userId: entry.userId.toLowerCase(), mode: entry.mode as 'INVITE' | 'BOOK' };
  });
  if (new Set(players.map(player => player.userId)).size !== players.length) throw new BadRequestException('Each player can be selected only once.');
  return players;
}
export function initialPlayerSelections(b: Record<string, unknown>): PlayerSelection[] {
  if (b.initialPlayers !== undefined) {
    if (b.initialPlayerIds !== undefined || b.initialPlayerMode !== undefined) throw new BadRequestException('Use one player-selection format.');
    return playerSelections(b.initialPlayers);
  }
  const legacy = initialPlayersInput(b); return legacy.ids.map(userId => ({ userId, mode: legacy.mode }));
}
