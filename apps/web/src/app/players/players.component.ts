import { IconComponent } from '../icon/icon.component';
import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AvatarComponent } from '../avatar/avatar.component';
import { message } from '../../auth.service';
interface Player { teamNumber: number | null; id: string; name: string; isGuest: boolean; status: 'CONFIRMED' | 'WAITLISTED'; avatarUrl: string | null; avatarColor: string; guestOf: string | null; }
@Component({
  selector: 'app-players', imports: [IconComponent, AvatarComponent],
  templateUrl: './players.component.html',
  styleUrl: './players.component.scss'
})
export class PlayersComponent implements OnChanges {
  @Input({ required: true }) eventId!: string;
  @Input() teamCount = 2;
  @Input() shirtColors: string[] = [];
  @Input() bibsProvided = false;
  teamNumbers() { return Array.from({ length: Math.max(2, Math.min(16, this.teamCount)) }, (_, i) => i + 1); }
  teamPlayers(team: number | null) { return this.group('CONFIRMED').filter(player => (player.teamNumber ?? null) === team); }
  startingColor(team: number) { return this.shirtColors[team - 1]?.trim() || null; }
  private readonly http = inject(HttpClient);
  readonly players = signal<Player[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  ngOnChanges() { void this.load(); }
  groupPlayers() { return this.group('WAITLISTED'); }
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
