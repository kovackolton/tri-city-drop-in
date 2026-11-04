import { Component, Input, OnChanges, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { StrikesStore } from '../../strikes.store';
import { eventTime } from '../../models';
import { contactEmailLink, contactPhoneLink } from '../../avatar';
@Component({ selector: 'app-strike-panel', imports: [DatePipe, CurrencyPipe], templateUrl: './strike-panel.component.html' })
export class StrikePanelComponent implements OnInit, OnChanges {
  @Input() openRequest = 0;
  readonly open = signal(false);
  ngOnChanges() { if (this.openRequest > 0) this.open.set(true); }
  readonly strikes = inject(StrikesStore); readonly time = eventTime;
  readonly emailLink = contactEmailLink; readonly phoneLink = contactPhoneLink;
  label(value: string) { return value.replaceAll('_', ' ').toLowerCase(); }
  paid(value: boolean | null) { return value === null ? 'Not reviewed' : value ? 'Paid' : 'Not paid'; }
  ngOnInit() { void this.strikes.load(); }
}
