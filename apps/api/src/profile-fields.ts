import { BadRequestException } from '@nestjs/common';
import { object, text, integer } from './validation';
export const avatarColors = ['emerald', 'teal', 'sky', 'indigo', 'violet', 'rose', 'amber', 'slate'] as const;
export function googleAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^lh\d+\.googleusercontent\.com$/.test(url.hostname) && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
export function profileInput(value: unknown) {
  const b = object(value, ['nickname', 'skillLevel', 'preferredPositions', 'contactEmail', 'phone', 'avatarColor', 'useGooglePhoto', 'accountName']);
  const data: { preferredPositions?: string[]; nickname?: string | null; skillLevel?: number | null; accountName?: string; contactEmail?: string | null; phone?: string | null; avatarColor?: string; useGooglePhoto?: boolean } = {};
  if (b.nickname !== undefined) data.nickname = b.nickname === '' || b.nickname === null ? null : text(b.nickname, 'Nickname', 80);
  if (b.preferredPositions !== undefined) {
    const positions = ['GK', 'DF', 'MF', 'F'];
    if (!Array.isArray(b.preferredPositions) || b.preferredPositions.length > 4 || b.preferredPositions.some(value => typeof value !== 'string' || !positions.includes(value)) || new Set(b.preferredPositions).size !== b.preferredPositions.length) throw new BadRequestException('Choose preferred positions from GK, DF, MF and F.');
    data.preferredPositions = positions.filter(position => (b.preferredPositions as string[]).includes(position));
  }
  if (b.skillLevel !== undefined) data.skillLevel = b.skillLevel === null ? null : integer(b.skillLevel, 'Skill rating', 1, 5);
  if (b.accountName !== undefined) data.accountName = text(b.accountName, 'Account name', 80);
  if (b.contactEmail !== undefined) {
    const email = b.contactEmail === null || b.contactEmail === '' ? null : text(b.contactEmail, 'Contact email', 254).toLowerCase();
    if (email && !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(email)) throw new BadRequestException('Enter a valid contact email.');
    data.contactEmail = email;
  }
  if (b.phone !== undefined) {
    const phone = b.phone === null || b.phone === '' ? null : text(b.phone, 'Phone', 40);
    const digits = phone?.replace(/\D/g, '') ?? '';
    if (phone && (!/^\+?[0-9 ().-]+$/.test(phone) || digits.length < 7 || digits.length > 15)) throw new BadRequestException('Enter a phone number with 7 to 15 digits, optionally including a country code.');
    data.phone = phone;
  }
  if (b.avatarColor !== undefined) {
    if (!avatarColors.includes(b.avatarColor as typeof avatarColors[number])) throw new BadRequestException('Choose an available avatar color.');
    data.avatarColor = b.avatarColor as string;
  }
  if (b.useGooglePhoto !== undefined) {
    if (typeof b.useGooglePhoto !== 'boolean') throw new BadRequestException('Choose whether to use your Google photo.');
    data.useGooglePhoto = b.useGooglePhoto;
  }
  return data;
}
export const appearanceSelect = { displayName: true, nickname: true, avatarUrl: true, avatarColor: true, useGooglePhoto: true } as const;
export function appearance(user: { displayName: string; nickname?: string | null; avatarUrl: string | null; avatarColor: string; useGooglePhoto: boolean }) {
  return { displayName: user.nickname ?? user.displayName, avatarColor: user.avatarColor, avatarUrl: user.useGooglePhoto ? googleAvatarUrl(user.avatarUrl) : null };
}
