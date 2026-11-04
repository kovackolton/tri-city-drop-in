import { Controller, Get, Inject, Injectable, NotFoundException, Param, Res, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Database } from './database';
// Public sharing selects event/venue facts and anonymous seat statuses only.
const select = {
  id: true, title: true, description: true, startsAt: true, endsAt: true, capacity: true, priceCents: true, status: true,
  teamCount: true, teamBalancingEnabled: true, bibsProvided: true, shirtColorCount: true, minPlayers: true,
  maxGuestsPerUser: true, cancellationCutoffHours: true,
  location: { select: { id: true, name: true, city: true, address: true, timezone: true, photoUrl: true, photoCredit: true, mapEmbedUrl: true } },
  signups: { where: { status: { in: ['CONFIRMED', 'WAITLISTED'] } }, select: { status: true } }
} as const satisfies Prisma.EventSelect;
export type ShareEvent = Prisma.EventGetPayload<{ select: typeof select }>;
const validId = (id: string) => /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id);
export function siteOrigin(value = process.env.PUBLIC_SITE_ORIGIN ?? (process.env.NODE_ENV !== 'production' ? process.env.WEB_ORIGIN ?? 'http://localhost:4200' : undefined)) {
  try {
    const url = new URL(value ?? '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new ServiceUnavailableException('Set PUBLIC_SITE_ORIGIN to the public HTTPS site origin.'); }
}
export function html(value: string) { return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!)); }
export function availability(event: Pick<ShareEvent, 'status' | 'startsAt' | 'endsAt' | 'capacity' | 'signups'>, now = new Date()) {
  const confirmed = event.signups.filter(seat => seat.status === 'CONFIRMED').length;
  const waitlisted = event.signups.filter(seat => seat.status === 'WAITLISTED').length;
  const remaining = Math.max(0, event.capacity - confirmed);
  if (event.status === 'CANCELLED') return { open: false, text: 'Cancelled', action: 'View upcoming games', confirmed, waitlisted, remaining };
  if (event.status === 'COMPLETED' || event.endsAt <= now) return { open: false, text: 'Event ended', action: 'View upcoming games', confirmed, waitlisted, remaining };
  if (event.startsAt <= now) return { open: false, text: 'Game started / joining closed', action: 'View upcoming games', confirmed, waitlisted, remaining };
  if (waitlisted > 0) return { open: true, text: `Waitlist open / ${waitlisted} waiting`, action: 'Join Waitlist', confirmed, waitlisted, remaining };
  if (!remaining) return { open: true, text: 'Full / waitlist open', action: 'Join Waitlist', confirmed, waitlisted, remaining };
  return { open: true, text: `${remaining} ${remaining === 1 ? 'spot' : 'spots'} available`, action: 'Join Game', confirmed, waitlisted, remaining };
}
function photoUrl(value: string | null) {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function previewMetadata(event: ShareEvent, origin: string, now = new Date()) {
  const state = availability(event, now);
  const when = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: event.location.timezone, timeZoneName: 'short' }).format(event.startsAt);
  const price = event.priceCents === 0 ? 'Free' : `USD ${(event.priceCents / 100).toFixed(2)} per player`;
  return { url: `${origin}/games/${event.id}`, title: `${event.title} / ${state.open ? state.action : state.text}`, description: `${when} / ${event.location.name} / ${price} / ${state.text}. Availability can change.`, availability: state.text, action: state.action, open: state.open, when, price, image: photoUrl(event.location.photoUrl) ?? `${origin}/share/soccer-ball.png` };
}
export function renderPreview(event: ShareEvent | null, origin: string, now = new Date()) {
  const meta = event ? previewMetadata(event, origin, now) : { url: origin, title: 'Game unavailable / Tri-City Drop-In Soccer', description: 'This game is unavailable. Browse upcoming drop-in soccer games.', image: `${origin}/share/soccer-ball.png`, availability: 'Game unavailable', action: 'View upcoming games', open: false, when: '', price: '' };
  const fallback = `${origin}/share/soccer-ball.png`;
  const imageAlt = meta.image === fallback ? 'Soccer ball' : `Venue photo for ${event?.location.name}`;
  const link = event && meta.open ? `${origin}/?event=${event.id}` : `${origin}/`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(meta.title)}</title>
<meta name="description" content="${html(meta.description)}"><meta property="og:type" content="website"><meta property="og:site_name" content="Tri-City Drop-In Soccer"><meta property="og:title" content="${html(meta.title)}"><meta property="og:description" content="${html(meta.description)}"><meta property="og:url" content="${html(meta.url)}"><meta property="og:image" content="${html(meta.image)}"><meta property="og:image:alt" content="${html(imageAlt)}">${meta.image === fallback ? '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' : ''}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${html(meta.title)}"><meta name="twitter:description" content="${html(meta.description)}"><meta name="twitter:image" content="${html(meta.image)}"><link rel="canonical" href="${html(meta.url)}"><link rel="icon" type="image/png" href="${html(origin)}/favicon.png"><link rel="apple-touch-icon" href="${html(origin)}/favicon.png"><script src="${html(origin)}/theme-init.js"></script><link rel="stylesheet" href="${html(origin)}/styles.css">
<style>body{margin:0;font-family:system-ui,sans-serif;background:var(--page,#f8f6f5);color:var(--text,#252a31)}.preview{max-width:44rem;margin:2rem auto;padding:1rem}.brand{color:var(--accent,#2456a0);font-weight:700;text-decoration:none}.card{margin-top:1.5rem;border:1px solid var(--border,#c4cbd4);border-radius:1rem;overflow:hidden;background:var(--surface,#fff)}.event-photo{display:block;object-fit:cover;max-height:22rem;width:100%;aspect-ratio:1200/630}.details{padding:1.5rem}.details h1{font-size:1.8rem;line-height:1.2;overflow-wrap:anywhere}.meta{line-height:1.7}.availability{font-weight:700;margin:1rem 0}.button{display:inline-block;padding:.8rem 1.2rem;border-radius:.7rem;background:var(--primary,#c02f2a);color:var(--on-primary,#fff);font-weight:700;text-decoration:none}.button:focus-visible{outline:3px solid var(--focus,#2456a0);outline-offset:4px}.note,.photo-credit{font-size:.8rem;color:var(--muted,#5c6470);line-height:1.6}.description{white-space:pre-line;overflow-wrap:anywhere}.photo-credit{margin-top:.5rem}</style></head>
<body><main class="preview"><a class="brand" href="${html(origin)}/">TRI-CITY DROP-IN SOCCER</a><article class="card"><img class="event-photo" src="${html(meta.image)}" data-fallback="${html(fallback)}" width="1200" height="630" alt="${html(imageAlt)}" referrerpolicy="no-referrer"><div class="details">${event?.location.photoCredit && meta.image !== fallback ? `<p class="photo-credit">${html(event.location.photoCredit)}</p>` : ''}<h1>${html(event?.title ?? 'Game unavailable')}</h1>${event ? `<p class="meta">${html(meta.when)}<br>${html(event.location.name)}<br>${html(event.location.address)}<br>${html(meta.price)}</p>` : ''}<p class="availability">${html(meta.availability)}</p>${event?.description ? `<p class="description">${html(event.description)}</p>` : ''}<a class="button" href="${html(link)}">${html(meta.action)}</a><p class="note">${meta.open ? 'Open this game to view current availability and join. Sign-in, the participation waiver, strike rules and paid-cost confirmation apply. Sharing or tapping this preview does not book a seat.' : 'Joining is unavailable for this game. Browse the latest upcoming games instead.'}</p><p class="note">Availability in a message preview is a snapshot and may be cached by your messaging app. The game page shows current availability.</p></div></article></main><script src="${html(origin)}/share/preview.js" defer></script></body></html>`;
}
@Injectable()
export class EventSharingService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async event(id: string) {
    if (!validId(id)) return null;
    return this.db.event.findFirst({ where: { id, deletedAt: null, status: { in: ['PUBLISHED', 'CANCELLED', 'COMPLETED'] } }, select });
  }
  async publicGame(id: string) {
    const event = await this.event(id);
    if (!event || !availability(event).open) throw new NotFoundException('This game is no longer open for joining. It may have started, ended or been cancelled.');
    const state = availability(event);
    return { game: {
      id: event.id, title: event.title, description: event.description, startsAt: event.startsAt, endsAt: event.endsAt, capacity: event.capacity,
      priceCents: event.priceCents, currency: 'USD', locationId: event.location.id, location: event.location.name, address: event.location.address, city: event.location.city, timezone: event.location.timezone,
      photoUrl: event.location.photoUrl, photoCredit: event.location.photoCredit, mapEmbedUrl: event.location.mapEmbedUrl,
      confirmed: state.confirmed, waitlisted: state.waitlisted, maxGuestsPerUser: event.maxGuestsPerUser, cancellationCutoffHours: event.cancellationCutoffHours,
      teamCount: event.teamCount, teamBalancingEnabled: event.teamBalancingEnabled, bibsProvided: event.bibsProvided, shirtColorCount: event.shirtColorCount, minPlayers: event.minPlayers
    }, share: previewMetadata(event, siteOrigin()) };
  }
}
interface Response { status(code: number): this; setHeader(name: string, value: string): unknown; send(body: string | Buffer): unknown; }
function asset(name: string) {
  const paths = [resolve(__dirname, '../assets', name), resolve(__dirname, '../../assets', name)];
  return readFileSync(paths.find(path => existsSync(path)) ?? paths[0]);
}
@Controller()
export class EventSharingController {
  constructor(@Inject(EventSharingService) private readonly service: EventSharingService) {}
  @Get('api/public/games/:id') game(@Param('id') id: string) { return this.service.publicGame(id); }
  @Get('games/:id') async page(@Param('id') id: string, @Res() res: Response) {
    const origin = siteOrigin(), event = await this.service.event(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    if (!event || !availability(event).open) res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(event ? 200 : 404).send(renderPreview(event, origin));
  }
  @Get('share/soccer-ball.png') ball(@Res() res: Response) { return this.image(res, 'soccer-ball.png'); }
  @Get('share/soccer-icon.png') icon(@Res() res: Response) { return this.image(res, 'soccer-icon.png'); }
  private image(res: Response, name: string) { res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'public, max-age=86400'); res.setHeader('X-Content-Type-Options', 'nosniff'); return res.send(asset(name)); }
  @Get('share/preview.js') script(@Res() res: Response) { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.setHeader('Cache-Control', 'public, max-age=3600'); res.setHeader('X-Content-Type-Options', 'nosniff'); return res.send(asset('preview.js')); }
}
