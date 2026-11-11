import { Component, EventEmitter, Input, OnChanges, SimpleChanges, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarSelection, calendarDate, matchesCalendar } from '../../calendar';
@Component({ selector: 'app-calendar-picker', imports: [FormsModule], templateUrl: './calendar-picker.component.html', styleUrl: './calendar-picker.component.scss' })
export class CalendarPickerComponent implements OnChanges {
  @Input() selection: CalendarSelection = { period: 'all', date: calendarDate(new Date()) };
  @Output() selectionChange = new EventEmitter<CalendarSelection>();
  private readonly markedDates = signal(new Set<string>());
  @Input() set gameDates(value: string[]) { const dates = new Set(value), current = this.markedDates(); if (dates.size !== current.size || [...dates].some(date => !current.has(date))) this.markedDates.set(dates); }
  readonly markerError = signal(false);
  hasGame(date: string) { return this.markedDates().has(date); }
  mobileOpen = false;
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  readonly weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  ngOnChanges(changes?: SimpleChanges) { if (changes && !changes['selection']) return; const date = new Date(this.selection.date + 'T12:00:00'); if (Number.isFinite(date.getTime())) this.month = new Date(date.getFullYear(), date.getMonth(), 1); }
  title() { return this.month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  move(amount: number) { this.month = new Date(this.month.getFullYear(), this.month.getMonth() + amount, 1); }
  days() {
    const start = new Date(this.month); start.setDate(1 - (start.getDay() + 6) % 7);
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(date.getDate() + index); return { key: calendarDate(date), day: date.getDate(), outside: date.getMonth() !== this.month.getMonth(), label: date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) }; });
  }
  selected(key: string) { return this.selection.period !== 'all' && matchesCalendar(key + 'T12:00:00Z', 'UTC', this.selection); }
  today(key: string) { return key === calendarDate(new Date()); }
  choose(date: string) { this.selectionChange.emit({ period: this.selection.period === 'all' ? 'day' : this.selection.period, date }); }
  mode(period: CalendarSelection['period']) { this.selectionChange.emit({ ...this.selection, period }); }
  goToday() { this.selectionChange.emit({ period: this.selection.period === 'week' ? 'week' : 'day', date: calendarDate(new Date()) }); }
  keyboard(event: KeyboardEvent, key: string, container: HTMLElement) {
    const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
    if (!offset) return;
    event.preventDefault(); const date = new Date(key + 'T12:00:00'); date.setDate(date.getDate() + offset);
    const next = calendarDate(date); this.month = new Date(date.getFullYear(), date.getMonth(), 1);
    setTimeout(() => container.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());
  }
}
