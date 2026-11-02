import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../auth.service';
import { PaymentReviewComponent } from './payment-review.component';

describe('PaymentReviewComponent', () => {
  it('renders its external template with its initial state', async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentReviewComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CONFIG, useValue: { firebase: {} } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(PaymentReviewComponent);
    const inputs = {"signupId":"seat","payment":{"amountCents":1000,"status":"UNPAID","playerPaid":null,"organizerPaid":null,"playerReviewedAt":null,"organizerReviewedAt":null},"endsAt":"2099-01-01T12:00:00Z","eventStatus":"PUBLISHED"};
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    for (const request of http.match(() => true)) request.flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Pay in person at the event.");
    http.verify();
  });
});
