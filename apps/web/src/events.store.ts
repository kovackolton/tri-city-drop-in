import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { Game } from './models';
export interface GameFilters { period: 'all' | 'day' | 'week'; date: string; locationId: string; city: string; organizerId: string; search: string; freeOnly: boolean; spacesOnly: boolean; }
export function defaultGameFilters(): GameFilters {
  const today = new Date(), pad = (value: number) => String(value).padStart(2, '0');
  return { period: 'all', date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`, locationId: '', city: '', organizerId: '', search: '', freeOnly: false, spacesOnly: false };
}
interface Facets { locations: { id: string; name: string; city: string | null }[]; organizers: { id: string; name: string }[]; }
export const EventsStore = signalStore(
  { providedIn: 'root' },
  withState({ events: [] as Game[], loading: true, error: '', filters: defaultGameFilters(), locations: [] as Facets['locations'], organizers: [] as Facets['organizers'], filterError: '' }),
  withMethods((store, http = inject(HttpClient)) => {
    let revision = 0;
    return {
      async load(filters?: GameFilters) {
        if (filters) patchState(store, { filters: { ...filters } });
        const current = ++revision, f = store.filters();
        patchState(store, { loading: true, error: '' });
        try {
          const events = await firstValueFrom(http.get<Game[]>('/api/events', { params: { period: f.period, ...(f.period !== 'all' ? { date: f.date } : {}), ...(f.locationId ? { locationId: f.locationId } : {}), ...(f.city ? { city: f.city } : {}), ...(f.organizerId ? { organizerId: f.organizerId } : {}), ...(f.search.trim() ? { search: f.search.trim() } : {}), freeOnly: String(f.freeOnly), spacesOnly: String(f.spacesOnly) } }));
          if (current === revision) patchState(store, { events, loading: false });
        } catch { if (current === revision) patchState(store, { loading: false, error: 'Games could not be loaded. Please check your filters and try again.' }); }
      },
      async loadFilters() {
        patchState(store, { filterError: '' });
        try { const options = await firstValueFrom(http.get<Facets>('/api/events/filters')); patchState(store, { locations: options?.locations ?? [], organizers: options?.organizers ?? [] }); }
        catch { patchState(store, { filterError: 'Location and organizer filters could not be loaded.' }); }
      }
    };
  })
);
