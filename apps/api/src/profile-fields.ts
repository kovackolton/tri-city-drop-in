import { BadRequestException } from '@nestjs/common';
import { object, text } from './validation';
export const avatarColors = ['emerald', 'teal', 'sky', 'indigo', 'violet', 'rose', 'amber', 'slate'] as const;
export function googleAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^lh\d+\.googleusercontent\.com$/.test(url.hostname) && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
export function profileInput(value: unknown) {
  const b = object(value, ['displayName', 'contactEmail', 'phone', 'avatarColor', 'useGooglePhoto']);
  const data: { displayName?: string; contactEmail?: string | null; phone?: string | null; avatarColor?: string; useGooglePhoto?: boolean } = {};
  if (b.displayName !== undefined) data.displayName = text(b.displayName, 'Display name', 80);
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
export const appearanceSelect = { displayName: true, avatarUrl: true, avatarColor: true, useGooglePhoto: true } as const;
export function appearance(user: { displayName: string; avatarUrl: string | null; avatarColor: string; useGooglePhoto: boolean }) {
  return { displayName: user.displayName, avatarColor: user.avatarColor, avatarUrl: user.useGooglePhoto ? googleAvatarUrl(user.avatarUrl) : null };
}
