import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { message } from '../../auth.service';
interface Player { id: string; name: string; isGuest: boolean; status: 'CONFIRMED' | 'WAITLISTED'; }
@Component({
  selector: 'app-players',
  templateUrl: './players.component.html',
  styleUrl: './players.component.scss'
})
export class PlayersComponent implements OnChanges {
  @Input({ required: true }) eventId!: string;
  private readonly http = inject(HttpClient);
  readonly players = signal<Player[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  ngOnChanges() { void this.load(); }
  group(status: Player['status']) { return this.players().filter(p => p.status === status); }
  async load() {
    const eventId = this.eventId;
    this.loading.set(true); this.error.set(''); this.players.set([]);
    try {
      const players = await firstValueFrom(this.http.get<Player[]>(`/api/events/${eventId}/players`));
      if (eventId === this.eventId) this.players.set(players);
    } catch (error) { if (eventId === this.eventId) this.error.set(message(error)); }
    finally { if (eventId === this.eventId) this.loading.set(false); }
  }
}
