import { IconComponent } from '../icon/icon.component';
import { Component, Input, OnChanges, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { WaiverStore } from '../../waiver.store';
@Component({ selector: 'app-waiver-panel', imports: [IconComponent, DatePipe], templateUrl: './waiver-panel.component.html' })
export class WaiverPanelComponent implements OnInit, OnChanges {
  @Input() openRequest = 0;
  readonly open = signal(false); readonly waiver = inject(WaiverStore);
  ngOnInit() { void this.waiver.load(); }
  ngOnChanges() { if (this.openRequest > 0) this.open.set(true); }
}
