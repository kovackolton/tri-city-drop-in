export type CalendarPeriod = 'all' | 'day' | 'week';
export interface CalendarSelection { period: CalendarPeriod; date: string; }
export function calendarDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function venueDate(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone }).formatToParts(new Date(value));
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function matchesCalendar(value: string, timezone: string, selection: CalendarSelection) {
  if (selection.period === 'all') return true;
  const local = venueDate(value, timezone);
  if (selection.period === 'day') return local === selection.date;
  const start = new Date(selection.date + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
  return local >= start.toISOString().slice(0, 10) && local < end.toISOString().slice(0, 10);
}
