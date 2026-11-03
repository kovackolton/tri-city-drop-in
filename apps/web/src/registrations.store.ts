import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { message } from './auth.service';
import { EventGuidance, Location } from './models';
import { PaymentReview } from './app/payment-review/payment-review.component';

export interface Seat {
  queuedAt?: string; cancelledAt?: string | null; cancellationSource?: 'PLAYER' | 'ORGANIZER' | 'EVENT' | null; playerCancellationCount?: number; legacyCancellationCount?: number; bookingCount?: number; id: string; eventId: string; bookingId: string; guestNumber: number; guestName: string | null;
  teamNumber?: number | null; status: 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED'; quotedPriceCents: number; lateCancellation: boolean;
  payment: PaymentReview | null;
  attendance: string; guestPaymentAcknowledgedAt?: string | null; guestPaymentTermsVersion?: string | null;
  strikes: { id: string; reason: string; createdAt: string; revokedAt: string | null; expiresAt: string | null }[];
  event: EventGuidance & { title: string; description?: string | null; capacity?: number; startsAt: string; endsAt: string; status: string; cancellationCutoffHours: number; location: Location; organizer: { displayName: string; avatarUrl?: string | null; avatarColor?: string } };
}
export const RegistrationsStore = signalStore(
  { providedIn: 'root' },
  withState({ seats: [] as Seat[], loading: false, busy: false, error: '', notice: '' }),
  withMethods((store, http = inject(HttpClient)) => {
    let revision = 0;
    async function load() {
      const current = revision;
      patchState(store, { loading: true, error: '' });
      try {
        const seats = await firstValueFrom(http.get<Seat[]>('/api/me/signups'));
        if (current === revision) patchState(store, { seats });
      } catch (error) { if (current === revision) patchState(store, { error: message(error) }); }
      finally { if (current === revision) patchState(store, { loading: false }); }
    }
    async function mutate(path: string, body: unknown, notice: string) {
      if (store.busy()) return false;
      const current = revision;
      patchState(store, { busy: true, error: '', notice: '' });
      try {
        await firstValueFrom(http.post(path, body));
        if (current !== revision) return false;
        await load();
        if (current === revision) patchState(store, { notice });
        return true;
      } catch (error) { if (current === revision) patchState(store, { error: message(error) }); return false; }
      finally { if (current === revision) patchState(store, { busy: false }); }
    }
    return {
      load,
      reset() { revision++; patchState(store, { seats: [], loading: false, busy: false, error: '', notice: '' }); },
      join(eventId: string, guests: string[], expectedPriceCents: number, guestPaymentAcknowledged = false) { return mutate(`/api/events/${eventId}/signups`, { guests, expectedPriceCents, guestPaymentAcknowledged }, 'Booking saved. Check your confirmed or waitlisted status below.'); },
      cancel(eventId: string, bookingId: string) { return mutate(`/api/events/${eventId}/signups/${bookingId}/cancel`, {}, 'Your whole party has been cancelled.'); }
    };
  })
);
