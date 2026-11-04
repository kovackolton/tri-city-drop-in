import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signal } from '@angular/core';
import { AuthService } from './auth.service';
import { NotificationsStore } from './notifications.store';

describe('NotificationsStore', () => {
  let store: NotificationsStore;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { profile: signal({ id: 'player' }) } }] });
    store = TestBed.inject(NotificationsStore); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('discards responses that arrive after an account change', async () => {
    const pending = store.load(); const old = http.expectOne('/api/me/notifications');
    store.reset(); old.flush({ items: [{ id: 'private' }], unread: 1 }); await pending;
    expect(store.items()).toEqual([]); expect(store.unread()).toBe(0);
  });
  it('reloads the authoritative unread count after marking all read', async () => {
    const pending = store.read();
    const mutation = http.expectOne('/api/me/notifications/read-all'); expect(mutation.request.method).toBe('POST'); mutation.flush({ updated: 2 });
    await Promise.resolve();
    http.expectOne('/api/me/notifications').flush({ items: [], unread: 0 }); await pending;
    expect(store.unread()).toBe(0); expect(store.loading()).toBe(false);
  });
  it('shows a recoverable error when the inbox cannot be loaded', async () => {
    const pending = store.load(); http.expectOne('/api/me/notifications').error(new ProgressEvent('error')); await pending;
    expect(store.error()).toContain('Cannot reach the API'); expect(store.loading()).toBe(false);
  });
});
