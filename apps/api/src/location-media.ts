import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';
export function locationPhotoUrl(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 2048) throw new BadRequestException('Use an HTTPS photo URL of at most 2048 characters.');
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.') || /\.(?:localhost|local|internal)$/.test(url.hostname)) throw new Error();
    return url.href;
  } catch { throw new BadRequestException('Use an HTTPS photo URL on a public image host, without credentials or a custom port.'); }
}
export function locationMapUrl(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 12000) throw new BadRequestException('Paste a Google Maps embed URL or its copied iframe.');
  let source = value.trim();
  if (source.startsWith('<')) {
    const iframe = /^<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>\s*<\/iframe>$/i.exec(source);
    if (!iframe) throw new BadRequestException('Paste only the Google Maps embed iframe or its src URL.');
    source = iframe[2].replace(/&amp;/g, '&');
  }
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || !['www.google.com', 'google.com'].includes(url.hostname) || url.pathname !== '/maps/embed' || !url.searchParams.get('pb') || url.username || url.password || url.port) throw new Error();
    return url.href;
  } catch { throw new BadRequestException('Use Google Maps: Share, Embed a map, Copy HTML. A normal Maps sharing link is not an embed.'); }
}
