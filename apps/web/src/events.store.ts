import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { Game } from './models';

export const EventsStore = signalStore(
  { providedIn: 'root' },
  withState({ events: [] as Game[], loading: true, error: '' }),
  withMethods((store, http = inject(HttpClient)) => ({
    async load() {
      patchState(store, { loading: true, error: '' });
      try { patchState(store, { events: await firstValueFrom(http.get<Game[]>('/api/events')), loading: false }); }
      catch { patchState(store, { loading: false, error: 'Games could not be loaded. Please try again.' }); }
    }
  }))
);

