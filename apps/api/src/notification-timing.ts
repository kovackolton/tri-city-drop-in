export function localGameDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function tomorrowGameDate(now: Date, timezone: string) {
  const date = new Date(localGameDate(now, timezone) + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10);
}
export function reminderDue(startsAt: Date, timezone: string, now = new Date()) {
  return startsAt > now && localGameDate(startsAt, timezone) <= tomorrowGameDate(now, timezone);
}
export function gameReminderLabel(startsAt: Date, timezone: string, now = new Date()) {
  if (startsAt <= now) return 'Game reminder';
  const day = localGameDate(startsAt, timezone);
  if (day === localGameDate(now, timezone)) return 'Your game is today';
  if (day === tomorrowGameDate(now, timezone)) return 'You have a game tomorrow';
  return 'Your upcoming game is on ' + new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' }).format(startsAt);
}
