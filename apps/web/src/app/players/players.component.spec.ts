import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../auth.service';
import { PlayersComponent } from './players.component';

describe('PlayersComponent', () => {
  it('renders its external template with its initial state', async () => {
    await TestBed.configureTestingModule({
      imports: [PlayersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CONFIG, useValue: { firebase: {} } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(PlayersComponent);
    const inputs = {"eventId":"game"};
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    for (const request of http.match(() => true)) request.flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("No confirmed players.");
    http.verify();
  });
});
