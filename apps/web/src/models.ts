export interface Game { id: string; title: string; description: string | null; startsAt: string; endsAt: string; location: string; address: string; timezone: string; capacity: number; priceCents: number; currency: 'USD'; confirmed: number; waitlisted: number; maxGuestsPerUser: number; cancellationCutoffHours: number; }
export interface Location { id: string; name: string; address: string; timezone: string; }
export interface ManagedEvent { id: string; title: string; description: string | null; startsAt: string; endsAt: string; status: string; priceCents: number; capacity: number; maxGuestsPerUser: number; cancellationCutoffHours: number; location: Location; }
export function eventTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone, timeZoneName: 'short' }).format(new Date(value));
}
