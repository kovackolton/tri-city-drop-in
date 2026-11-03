import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../auth.service';
import { OrganizerSeatComponent } from './organizer-seat.component';

describe('OrganizerSeatComponent', () => {
  it('renders its external template with its initial state', async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerSeatComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CONFIG, useValue: { firebase: {} } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(OrganizerSeatComponent);
    const inputs = {"eventId":"game","seat":{"id":"seat","bookingId":"booking","guestNumber":0,"status":"CONFIRMED","attendance":"UNMARKED","strikes":[],"user":{"displayName":"Player","accountName":"Player","nickname":null,"skillLevel":null,"contactEmail":"player@example.invalid","phone":null},"payment":null,"event":{"startsAt":"2099-01-01T11:00:00Z","endsAt":"2099-01-01T12:00:00Z","status":"PUBLISHED"}}};
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    for (const request of http.match(() => true)) request.flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Attendance: UNMARKED");
    http.verify();
  });
});
