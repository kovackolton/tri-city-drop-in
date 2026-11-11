import { Directive, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CalendarPickerComponent } from './calendar-picker.component';

@Directive({ selector: 'app-calendar-picker[gameDatesUrl]' })
export class CalendarGameDatesDirective implements OnChanges, OnDestroy {
  @Input({ required: true }) gameDatesUrl = '';
  @Input() gameDatesQuery = '{}';
  @Input() gameDatesRefresh: unknown = 0;
  private readonly http = inject(HttpClient);
  private readonly calendar = inject(CalendarPickerComponent);
  private revision = 0;
  ngOnChanges() { void this.load(); }
  ngOnDestroy() { this.revision++; }
  private async load() {
    const revision = ++this.revision;
    this.calendar.gameDates = []; this.calendar.markerError.set(false);
    try {
      const params = JSON.parse(this.gameDatesQuery);
      const dates = await firstValueFrom(this.http.get<string[]>(this.gameDatesUrl, { params }));
      if (revision === this.revision) this.calendar.gameDates = Array.isArray(dates) ? dates : [];
    } catch { if (revision === this.revision) this.calendar.markerError.set(true); }
  }
}
