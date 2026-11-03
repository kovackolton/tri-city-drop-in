import { BadRequestException } from '@nestjs/common';
export interface EventFilters { period: 'all' | 'day' | 'week'; date?: string; locationId?: string; city?: string; organizerId?: string; search?: string; freeOnly: boolean; spacesOnly: boolean; }
export function eventFilters(value: Record<string, unknown>): EventFilters {
  const string = (key: string, max = 80) => { const input = value[key]; if (input === undefined || input === '') return undefined; if (typeof input !== 'string' || input.length > max) throw new BadRequestException(`Invalid ${key} filter.`); return input.trim() || undefined; };
  const period = string('period') ?? 'all'; if (!['all', 'day', 'week'].includes(period)) throw new BadRequestException('Choose all dates, a day, or a week.');
  const date = string('date', 10);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date)) throw new BadRequestException('Choose a valid calendar date.');
  if (period !== 'all' && !date) throw new BadRequestException('Select a date for the day/week filter.');
  const boolean = (key: string) => { if (value[key] === undefined || value[key] === '' || value[key] === 'false') return false; if (value[key] === 'true') return true; throw new BadRequestException(`Invalid ${key} filter.`); };
  const id = (key: string) => { const input = string(key); if (input && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) throw new BadRequestException(`Invalid ${key}.`); return input; };
  return { period: period as EventFilters['period'], date, locationId: id('locationId'), organizerId: id('organizerId'), city: string('city'), search: string('search'), freeOnly: boolean('freeOnly'), spacesOnly: boolean('spacesOnly') };
}
export function matchesEventDate(startsAt: Date, timezone: string, filters: EventFilters) {
  if (filters.period === 'all') return true;
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone }).formatToParts(startsAt);
  const part = (name: string) => parts.find(value => value.type === name)!.value;
  const local = `${part('year')}-${part('month')}-${part('day')}`;
  if (filters.period === 'day') return local === filters.date;
  const start = new Date(filters.date! + 'T00:00:00Z'); const weekday = start.getUTCDay(); start.setUTCDate(start.getUTCDate() - (weekday + 6) % 7);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
  return local >= start.toISOString().slice(0, 10) && local < end.toISOString().slice(0, 10);
}
