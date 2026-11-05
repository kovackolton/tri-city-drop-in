import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { SharedGame } from './event-sharing';
import { Game } from './models';
export interface GameFilters { period: 'all' | 'day' | 'week'; date: string; locationId: string; city: string; organizerId: string; search: string; freeOnly: boolean; spacesOnly: boolean; }
export function activeGameFilterCount(filters: GameFilters) { return [filters.period !== 'all', !!filters.locationId, !!filters.city, !!filters.organizerId, !!filters.search.trim(), filters.freeOnly, filters.spacesOnly].filter(Boolean).length; }
export function defaultGameFilters(): GameFilters {
  const today = new Date(), pad = (value: number) => String(value).padStart(2, '0');
  return { period: 'all', date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`, locationId: '', city: '', organizerId: '', search: '', freeOnly: false, spacesOnly: false };
}
interface Facets { locations: { id: string; name: string; city: string | null }[]; organizers: { id: string; name: string }[]; }
export const EventsStore = signalStore(
  { providedIn: 'root' },
  withState({ selectedInviteToken: '', selectedId: '', selectedGame: null as Game | null, selectedLoading: false, selectedError: '', events: [] as Game[], loading: true, error: '', filters: defaultGameFilters(), locations: [] as Facets['locations'], organizers: [] as Facets['organizers'], filterError: '' }),
  withMethods((store, http = inject(HttpClient)) => {
    let revision = 0, selectedRevision = 0;
    return {
      clearSelected() { selectedRevision++; patchState(store, { selectedInviteToken: '', selectedId: '', selectedGame: null, selectedLoading: false, selectedError: '' }); },
      async loadSelected(id: string, invite = '') {
        const current = ++selectedRevision;
        patchState(store, { selectedInviteToken: invite, selectedId: id, selectedGame: null, selectedLoading: true, selectedError: '' });
        try {
          const result = await firstValueFrom(http.get<SharedGame>(invite ? `/api/private/games/${encodeURIComponent(id)}?invite=${encodeURIComponent(invite)}` : `/api/public/games/${encodeURIComponent(id)}`));
          if (current === selectedRevision) patchState(store, { selectedGame: result.game, selectedLoading: false });
        } catch { if (current === selectedRevision) patchState(store, { selectedGame: null, selectedLoading: false, selectedError: 'This game is unavailable for joining. It may have started, ended or been cancelled. You can browse other upcoming games below.' }); }
      },
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
