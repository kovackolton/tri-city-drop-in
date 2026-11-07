import { LocationMapComponent } from '../location-map/location-map.component';
import { LocationThumbnailComponent } from '../location-thumbnail/location-thumbnail.component';
import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, message } from '../../auth.service';
import { Location } from '../../models';
@Component({
  selector: 'app-locations', imports: [FormsModule, LocationMapComponent, LocationThumbnailComponent],
  templateUrl: './locations.component.html',
  styleUrl: './locations.component.scss'
})
export class LocationsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  @Output() changed = new EventEmitter<void>();
  readonly showLocationForm = signal(false);
  readonly locations = signal<Location[]>([]);
  readonly editing = signal(''); readonly deleting = signal(''); readonly checked = signal('');
  readonly busy = signal(false); readonly error = signal(''); readonly notice = signal('');
  search = ''; city = ''; media = ''; sort = 'name';
  cities() { return [...new Set(this.locations().map(location => location.city).filter((city): city is string => !!city))].sort(); }
  filteredLocations() {
    const search = this.search.trim().toLowerCase();
    return this.locations().filter(location => (!search || `${location.name} ${location.address} ${location.city ?? ''}`.toLowerCase().includes(search)) && (!this.city || location.city === this.city) && (!this.media || (this.media === 'photo' ? !!location.photoUrl : this.media === 'map' ? !!location.mapEmbedUrl : !location.photoUrl || !location.mapEmbedUrl))).sort((a, b) => (this.sort === 'city' ? (a.city ?? '').localeCompare(b.city ?? '') : 0) || a.name.localeCompare(b.name));
  }
  clearFilters() { this.search = ''; this.city = ''; this.media = ''; this.sort = 'name'; }
  form = { name: '', city: '', address: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, photoUrl: '', photoCredit: '', mapEmbedUrl: '' };
  ngOnInit() { void this.load(); }
  fingerprint() { return JSON.stringify(this.form); }
  invalidate() { this.checked.set(''); this.notice.set(''); }
  reset() { this.showLocationForm.set(false); this.editing.set(''); this.form = { name: '', city: '', address: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, photoUrl: '', photoCredit: '', mapEmbedUrl: '' }; this.invalidate(); }
  edit(location: Location) { this.showLocationForm.set(true); this.editing.set(location.id); this.form = { name: location.name, city: location.city ?? '', address: location.address, timezone: location.timezone, photoUrl: location.photoUrl ?? '', photoCredit: location.photoCredit ?? '', mapEmbedUrl: location.mapEmbedUrl ?? '' }; this.invalidate(); }
  async load() { try { this.locations.set(await firstValueFrom(this.http.get<Location[]>('/api/locations'))); } catch (e) { this.error.set(message(e)); } }
  async check() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.checked.set('');
    const fingerprint = this.fingerprint();
    try {
      const result = await firstValueFrom(this.http.post<{ duplicate: Location | null }>('/api/locations/check', this.form));
      if (fingerprint !== this.fingerprint()) return;
      if (result.duplicate && result.duplicate.id !== this.editing()) this.error.set(`Already exists: ${result.duplicate.name}, ${result.duplicate.address}. Use that location.`);
      else { this.checked.set(fingerprint); this.notice.set('No duplicate found. Ready to save.'); }
    } catch (e) { this.error.set(message(e)); } finally { this.busy.set(false); }
  }
  async save() {
    if (this.busy() || this.checked() !== this.fingerprint()) return;
    this.busy.set(true); this.error.set('');
    try { await firstValueFrom(this.editing() ? this.http.patch(`/api/locations/${this.editing()}`, this.form) : this.http.post('/api/locations', this.form)); this.reset(); await this.load(); this.notice.set('Location saved.'); this.changed.emit(); }
    catch (e) { this.error.set(message(e)); } finally { this.busy.set(false); }
  }
  async remove(id: string) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await firstValueFrom(this.http.delete(`/api/locations/${id}`)); this.deleting.set(''); if (this.editing() === id) this.reset(); await this.load(); this.changed.emit(); this.notice.set('Location deleted.'); }
    catch (e) { this.error.set(message(e)); } finally { this.busy.set(false); }
  }
}
