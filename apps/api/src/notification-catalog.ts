import { notificationDescriptions } from './notifications';
export const notificationTiers = ['URGENT', 'IMPORTANT', 'ROUTINE', 'IN_APP', 'TIME_SENSITIVE'] as const;
export type NotificationTier = typeof notificationTiers[number];
export type NotificationRules = Record<string, NotificationTier>;
const metadata: Record<string, [string, string, string, NotificationTier]> = {
  WAITLIST_PROMOTED: ['Waitlist promotion', 'Players', 'When a whole booking party moves from the waitlist into confirmed seats.', 'URGENT'],
  EVENT_CANCELLED: ['Event cancellation', 'Players', 'When an organizer cancels an event or an administrator deletes a future event with active bookings.', 'URGENT'],
  EVENT_CHANGED: ['Event details changed', 'Players', 'When an organizer or administrator changes an event with active bookings. Time-sensitive checks old/new kickoff times and whether time/location changed.', 'TIME_SENSITIVE'],
  EVENT_REMINDER: ['Upcoming game reminder', 'Players', 'On notification refresh or worker run for confirmed bookings today or tomorrow in the venue timezone. Wording is rebuilt at send time; expired reminders are skipped.', 'IMPORTANT'],
  PAYMENT_REVIEW_REMINDER: ['Payment report needed', 'Players', 'On refresh or worker run more than 24 hours after an event, when a paid confirmed seat still needs the player payment report.', 'IMPORTANT'],
  PAYMENT_STRIKE: ['Payment discrepancy strike', 'Players', 'After the grace period when an organizer explicitly marks an eligible paid seat Not received.', 'IMPORTANT'],
  ADMIN_PERMANENT_STRIKE: ['Permanent administrator strike', 'Players', 'When an administrator issues a permanent strike.', 'IMPORTANT'],
  STRIKE_ISSUED: ['Reviewed strike issued', 'Players', 'When an organizer records a reviewed attendance/cancellation strike.', 'IMPORTANT'],
  STRIKE_CLEARED: ['Strike cleared', 'Players', 'When a current strike is cleared or corrected.', 'ROUTINE'],
  BOOKING_REMOVED: ['Booking removed', 'Players', 'When an organizer removes a booking.', 'IMPORTANT'],
  EVENT_RETURNED_TO_DRAFT: ['Event returned to draft', 'Players', 'When an event with active bookings is returned to draft; existing bookings become provisional.', 'IMPORTANT'],
  EVENT_PUBLISHED: ['Event published', 'Players', 'When an event with existing provisional bookings is published.', 'ROUTINE'],
  EVENT_INVITATION: ['Event invitation', 'Players', 'When an organizer invites an existing player to a published event, including bulk invitations.', 'IMPORTANT'],
  ORGANIZER_BOOKED_PLAYER: ['Organizer booked a player', 'Players', 'When an organizer immediately books an existing player into an event.', 'IMPORTANT'],
  ORGANIZER_REVIEW_REMINDER: ['Event ready for review', 'Organizers', 'On refresh or worker run after an event ends, for its organizers while administrator sign-off is unfinished.', 'IMPORTANT'],
  STALE_EVENT_REVIEW_REMINDER: ['Event review overdue', 'Organizers and administrators', 'On refresh or worker run at least seven days after an event ends, for organizers and administrators while sign-off is unfinished.', 'IMPORTANT'],
  ORGANIZER_REQUEST: ['Organizer access requested', 'Administrators', 'When a player requests organizer access; refresh also covers administrators appointed later.', 'IMPORTANT'],
  ORGANIZER_ACCESS_GRANTED: ['Organizer access granted', 'Players', 'When an administrator directly grants organizer access.', 'ROUTINE'],
  ORGANIZER_REQUEST_GRANTED: ['Organizer request approved', 'Players', 'When an administrator grants an organizer role request.', 'ROUTINE'],
  ORGANIZER_REQUEST_CLEARED: ['Organizer request cleared', 'Players', 'When an administrator clears a pending organizer request.', 'ROUTINE'],
  USER_ROLE_CHANGED: ['Account role changed', 'All roles', 'When an administrator changes a user role.', 'IMPORTANT'],
  EVENT_ORGANIZER_ADDED: ['Added as co-organizer', 'Organizers', 'When an organizer is added to an event.', 'IMPORTANT'],
  EVENT_ORGANIZER_REMOVED: ['Removed as co-organizer', 'Organizers', 'When an organizer is removed from an event; player bookings stay unchanged.', 'IMPORTANT']
};
export const notificationCatalog = Object.entries(notificationDescriptions).map(([kind, message]) => {
  const [name, audience, trigger, defaultTier] = metadata[kind] ?? [kind, 'All roles', 'When this in-app notification is created.', 'IMPORTANT'];
  return { kind, name, audience, trigger, message, defaultTier };
});
export function defaultNotificationRules(): NotificationRules { return Object.fromEntries(notificationCatalog.map(n => [n.kind, n.defaultTier])); }
