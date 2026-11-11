import { notificationMessage } from './notifications';
export interface EmailEvent {
  title: string; startsAt: Date; endsAt: Date; status: string; deletedAt?: Date | null;
  cancellationCutoffHours: number; priceCents: number; description?: string | null;
  location: { name: string; address: string; timezone: string };
}
export interface EmailNotification { id: string; kind: string; payload: unknown; }
export interface RenderedEmail { subject: string; text: string; html: string; }
const subjects: Record<string, string> = {
  EVENT_REMINDER: 'Your game starts within 24 hours', EVENT_CHANGED: 'Event details changed',
  EVENT_CANCELLED: 'Event cancelled', WAITLIST_PROMOTED: 'Your party now has confirmed places',
  BOOKING_REMOVED: 'Your booking was removed', EVENT_RETURNED_TO_DRAFT: 'Event returned to draft',
  EVENT_PUBLISHED: 'Event published', EVENT_INVITATION: 'You are invited to this game',
  ORGANIZER_BOOKED_PLAYER: 'An organizer booked a place for you', PAYMENT_REVIEW_REMINDER: 'Please report your payment',
  PAYMENT_STRIKE: 'Payment discrepancy recorded', STRIKE_CLEARED: 'A strike was cleared',
  STRIKE_ISSUED: 'A reviewed strike was recorded', ADMIN_PERMANENT_STRIKE: 'Administrator strike recorded',
  ORGANIZER_REVIEW_REMINDER: 'Your game is ready for review', STALE_EVENT_REVIEW_REMINDER: 'Game review is overdue',
  ORGANIZER_REQUEST: 'Organizer access requested', ORGANIZER_ACCESS_GRANTED: 'Organizer access granted',
  ORGANIZER_REQUEST_GRANTED: 'Organizer access granted', ORGANIZER_REQUEST_CLEARED: 'Organizer request updated',
  USER_ROLE_CHANGED: 'Account role updated', EVENT_ORGANIZER_ADDED: 'You were added as an organizer',
  EVENT_ORGANIZER_REMOVED: 'Organizer assignment removed'
};
export function escapeEmail(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!)); }
export function renderNotificationEmail(notification: EmailNotification, event: EmailEvent | null, origin: string): RenderedEmail {
  const payload = (notification.payload && typeof notification.payload === 'object' ? notification.payload : {}) as { title?: string };
  const title = typeof payload.title === 'string' ? payload.title : event?.title ?? 'Game update';
  const subject = `${event?.title ?? 'Tri-City Drop-In Soccer'} - ${subjects[notification.kind] ?? title}`.replace(/[\r\n\t]/g, ' ').slice(0, 240);
  const notificationsUrl = origin + '/#notifications';
  const helpUrl = origin + '/#how-to/';
  const sections: { heading: string; text: string }[] = [{ heading: title, text: notificationMessage(notification.kind) }];
  const released = ['EVENT_CANCELLED', 'BOOKING_REMOVED'].includes(notification.kind);
  const staff = ['ORGANIZER_REVIEW_REMINDER', 'STALE_EVENT_REVIEW_REMINDER'].includes(notification.kind);
  if (event) {
    const time = (date: Date) => new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: event.location.timezone }).format(date);
    sections.push({ heading: 'Game details', text: `${event.title}\nStarts: ${time(event.startsAt)}\nEnds: ${time(event.endsAt)}\nTimezone: ${event.location.timezone}\n${event.location.name}\n${event.location.address}\n${event.priceCents === 0 ? 'Free event' : 'Listed event price: ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(event.priceCents / 100) + ' per player. Your accepted booking price is shown in My games.'}` });
    if (event.description && !released) sections.push({ heading: 'Organizer notes', text: event.description });
  }
  if (released || event?.status === 'CANCELLED' || event?.deletedAt) {
    sections.push({ heading: 'Cancellation and payment', text: 'Released cancelled seats do not require payment and do not create payment strikes. If you already paid, contact the organizer about any refund or credit; this app does not process refunds. Check the live notification and booking before making plans.' });
  } else if (notification.kind === 'EVENT_RETURNED_TO_DRAFT') {
    sections.push({ heading: 'Your provisional booking', text: 'Your booking remains provisional while the event is a draft. New joins are paused. Late-cancellation sub responsibility is not newly created while an event is a draft. Review My games for your current booking and accepted price.' });
  } else if (staff) {
    sections.push({ heading: 'Review the event', text: 'Open Notifications and choose Review this game to reach the event player review. Record attendance and whether payment was received, including guests and retained sub seats. A player saying I paid is not confirmation of receipt. Only explicitly organizer-marked unpaid seats receive payment strikes after the 24-hour grace period. Final sign-off is administrator-only, after players have had an opportunity to resolve discrepancies.' });
  } else if (['PAYMENT_REVIEW_REMINDER', 'PAYMENT_STRIKE'].includes(notification.kind)) {
    sections.push({ heading: 'Resolve payment reports', text: 'In My games, report whether you paid for each applicable seat, including guests and retained late-cancellation sub seats. Your I paid report does not confirm organizer receipt or clear a strike. Contact the organizer to resolve differences. After the 24-hour grace period, each fee-bearing seat explicitly marked Not received counts against its original booking account. Unreviewed seats do not count; organizer-confirmed payment clears the payment strike.' });
  } else if (['STRIKE_ISSUED', 'ADMIN_PERMANENT_STRIKE', 'STRIKE_CLEARED'].includes(notification.kind)) {
    sections.push({ heading: 'Review joining access', text: 'My profile lists your strike reasons and current joining access. Three current strikes block new bookings; existing bookings remain. A permanent administrator strike requires administrator correction, while payment strikes clear when the organizer records payment received. Review the exact reason in the app before deciding what action to take.' });
  } else if (event && !event.deletedAt && event.status === 'PUBLISHED') {
    sections.push({ heading: 'Cancellation cutoff and subs', text: `Cancel more than ${event.cancellationCutoffHours} hours before kickoff to release your confirmed seats without retained late-cancellation payment responsibility. At or inside the ${event.cancellationCutoffHours}-hour cutoff, you must acknowledge that seats stay reserved under your account and that you remain responsible for arranging subs and payment. Organizers need reasonable time to fill places and notify waitlisted people. Finding a sub does not transfer liability: even if the sub promises to pay, an unpaid fee-bearing retained seat can give the original booking account a payment strike after the normal grace period and explicit organizer Not received review. Free seats never receive payment strikes. The cancellation alone does not automatically issue a strike. Players can enter subs before kickoff; organizers/admins can correct them afterward. Waitlisted bookings cancel normally with no payment due, and contact suggestions never automatically book a sub.` });
    sections.push({ heading: 'Booking and payment', text: 'Check your live confirmed or waitlisted status before travelling. Nothing is due while waitlisted. If you are invited, accept the price and current waiver before joining. You are responsible for guests you book. Pay outside the app using the organizer instructions; report payment after the game. Event details and availability can change, so the app is the current record.' });
  }
  const links = [
    { label: 'Open Notifications', url: notificationsUrl },
    { label: 'Cancellation, subs and My games guide', url: helpUrl + 'my-games' },
    { label: 'Payment and strike rules', url: helpUrl + 'payment-strikes' },
    ...(staff ? [{ label: 'Organizer payment review guide', url: helpUrl + 'review-payments' }] : [])
  ];
  const footer = 'Manage notification emails in My profile and save your preference. In-app notifications remain available. This message was sent from an unmonitored no-reply address; use the organizer contact details in the app for game questions.';
  const text = sections.map(section => section.heading + '\n' + section.text).join('\n\n') + '\n\n' + links.map(link => link.label + ': ' + link.url).join('\n') + '\n\n' + footer;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eef0f3;color:#252a31;font-family:Arial,sans-serif"><main style="max-width:640px;margin:auto;padding:24px;background:#ffffff"><p style="font-weight:bold;color:#8e211e">TRI-CITY DROP-IN SOCCER</p>${sections.map(section => `<section style="margin-bottom:24px"><h2 style="font-size:19px">${escapeEmail(section.heading)}</h2><p style="font-size:15px;line-height:1.6;white-space:pre-line">${escapeEmail(section.text)}</p></section>`).join('')}<p><a href="${escapeEmail(notificationsUrl)}" style="display:inline-block;padding:14px 20px;background:#8e211e;color:white;text-decoration:none;border-radius:8px">Open Notifications</a></p>${links.slice(1).map(link => `<p><a href="${escapeEmail(link.url)}" style="color:#2456a0">${escapeEmail(link.label)}</a></p>`).join('')}<p style="font-size:12px;line-height:1.6;color:#5c6470">${escapeEmail(footer)}</p></main></body></html>`;
  return { subject, text, html };
}
