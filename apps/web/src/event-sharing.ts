import { Game } from './models';
export interface SharedGame { game: Game; share: { url: string; title: string; description: string; availability: string; action: string; open: boolean; image?: string; when?: string; price?: string }; }
export function sharedEventId(search: string) { return new URLSearchParams(search).get('event') ?? ''; }
export function shareMessage(share: SharedGame['share']) { return `${share.title}\n${share.description}\nTap the link to view the game and join.`; }
export function emailShareText(data: SharedGame) { return `${data.game.title}\r\n\r\n${data.share.description.replace(/\r?\n/g, '\r\n')}\r\n\r\n${data.share.action}: ${data.share.url}\r\n\r\nAvailability is a snapshot. Open the game for current details. Sign-in and joining rules apply; opening the link does not book a seat.`; }
export function emailShareLink(data: SharedGame) { return `mailto:?subject=${encodeURIComponent(data.share.title.replace(/[\r\n]+/g, ' '))}&body=${encodeURIComponent(emailShareText(data))}`; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
function publicUrl(value: string) {
  const url = new URL(value);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password) throw new Error('Invalid public share URL.');
  return url.href;
}
export function emailCardHtml(data: SharedGame) {
  const link = publicUrl(data.share.url), fallback = new URL('/share/soccer-ball.png', link).href;
  let image = fallback;
  try { image = publicUrl(data.share.image ?? data.game.photoUrl ?? fallback); } catch { /* Use the local soccer ball. */ }
  const text = escapeHtml;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;border:1px solid #c4cbd4;border-radius:12px;background:#ffffff;color:#252a31;font-family:Arial,sans-serif"><tr><td><a href="${text(link)}"><img src="${text(image)}" alt="${text(image === fallback ? 'Soccer ball' : 'Venue photo for ' + data.game.location)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr><tr><td style="padding:24px"><h2 style="margin:0 0 16px;font-size:24px">${text(data.game.title)}</h2><p style="line-height:1.6">${text(data.share.description)}</p>${data.game.photoCredit && image !== fallback ? `<p style="font-size:12px;color:#5c6470">${text(data.game.photoCredit)}</p>` : ''}<p style="font-weight:bold">${text(data.share.availability)}</p><p style="margin:24px 0"><a href="${text(link)}" style="display:inline-block;background:#c02f2a;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:8px;font-weight:bold">${text(data.share.action)}</a></p><p style="font-size:12px;line-height:1.6;color:#5c6470">Availability is a snapshot. Open the game for current details. Sign-in and joining rules apply; opening the link does not book a seat.</p><p style="font-size:12px;overflow-wrap:anywhere"><a href="${text(link)}">${text(link)}</a></p></td></tr></table>`;
}
