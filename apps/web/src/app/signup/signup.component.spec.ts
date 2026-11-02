import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../auth.service';
import { SignupComponent } from './signup.component';

describe('SignupComponent', () => {
  it('renders its external template with its initial state', async () => {
    await TestBed.configureTestingModule({
      imports: [SignupComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CONFIG, useValue: { firebase: {} } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(SignupComponent);
    const inputs = {"game":{"id":"game","title":"Soccer","priceCents":0,"capacity":20,"confirmed":0,"waitlisted":0,"maxGuestsPerUser":1,"cancellationCutoffHours":12}};
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    for (const request of http.match(() => true)) request.flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Join game");
    http.verify();
  });
});
