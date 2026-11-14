import { defaultNotificationRules, NotificationRules } from './notification-catalog';
import { EmailEvent, EmailNotification } from './notification-email';
export type EmailKind = 'URGENT' | 'DIGEST';
export function urgentNotification(notification: EmailNotification, event: EmailEvent | null, now: Date, rules: NotificationRules = defaultNotificationRules()) {
  const tier = rules[notification.kind] ?? 'IN_APP';
  if (tier === 'URGENT') return true;
  if (tier !== 'TIME_SENSITIVE') return false;
  const payload = notification.payload as { timeOrLocationChanged?: boolean; previousStartsAt?: string } | null;
  const previous = typeof payload?.previousStartsAt === 'string' ? new Date(payload.previousStartsAt) : null;
  const near = (date: Date) => date > now && date.getTime() - now.getTime() <= 86400000;
  return notification.kind === 'EVENT_CHANGED' && payload?.timeOrLocationChanged === true && !!event && (near(event.startsAt) || !!previous && near(previous));
}
export function importantNotification(kind: string, rules: NotificationRules = defaultNotificationRules()) { return ['URGENT', 'IMPORTANT', 'TIME_SENSITIVE'].includes(rules[kind] ?? 'IN_APP'); }
export function digestWindow(now: Date, startHour: number) { return now.getUTCHours() >= startHour; }
