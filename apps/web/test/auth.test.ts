import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignInComponent } from '../src/app/sign-in/sign-in.component';
import type { NgForm } from '@angular/forms';
import { signal, runInInjectionContext, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of, Subject } from 'rxjs';
import { AuthService, CONFIG, FIREBASE_AUTH_SDK, message } from '../src/auth.service';

function setup() {
  const calls: { name: string; args: unknown[] }[] = [];
  let listener: (user: any) => void = () => {};
  const user: any = { uid: 'local-user', email: 'player@example.invalid', emailVerified: false, providerData: [{ providerId: 'password' }], getIdToken: async (force?: boolean) => { calls.push({ name: 'token', args: [force] }); return 'test-token'; } };
  const auth = { currentUser: null as any };
  const invoke = (name: string) => async (...args: unknown[]) => { calls.push({ name, args }); };
  const sdk = {
    initializeApp: () => ({}), getAuth: () => auth, onIdTokenChanged: (_: unknown, callback: typeof listener) => { listener = callback; return () => {}; },
    signInWithPopup: invoke('google'), signOut: async () => { auth.currentUser = null; listener(null); },
    connectAuthEmulator: () => {}, signInWithEmailAndPassword: invoke('signin'),
    createUserWithEmailAndPassword: async (...args: unknown[]) => { calls.push({ name: 'create', args }); auth.currentUser = user; listener(user); return { user }; },
    sendEmailVerification: invoke('verify'), sendPasswordResetEmail: invoke('reset'),
    reload: invoke('reload'), validatePassword: async () => ({ isValid: true })
  };
  const http = { get: (url: string) => { calls.push({ name: 'api', args: [url] }); return of({ id: 'profile', role: 'PLAYER' }); } };
  const injector = Injector.create({ providers: [AuthService, { provide: CONFIG, useValue: { firebase: { apiKey: 'local', authDomain: 'local', projectId: 'local', appId: 'local' } } }, { provide: FIREBASE_AUTH_SDK, useValue: sdk }, { provide: HttpClient, useValue: http }] });
  const service = injector.get(AuthService);
  return { service, sdk, calls, user, auth, http, emit: (value: any) => { auth.currentUser = value; listener(value); } };
}

test('email sign-in sends the unchanged password only to Firebase and trims email', async () => {
  const { service, calls } = setup();
  await service.loginEmail(' player@example.invalid ', '  a private passphrase  ');
  assert.deepEqual(calls.map(c => c.name), ['signin']);
  assert.deepEqual(calls[0].args.slice(1), ['player@example.invalid', '  a private passphrase  ']);
  assert.equal(service.busy(), false);
});
test('registration sends verification and does not create an unverified API profile', async () => {
  const { service, calls } = setup();
  await service.register('player@example.invalid', 'a long private passphrase');
  assert.equal(service.needsVerification(), true); assert.equal(service.profile(), null);
  assert.deepEqual(calls.map(c => c.name), ['create', 'verify']);
  assert.match(service.notice(), /Account created/);
});
test('registration rejects short passwords and Firebase policy failures before account creation', async () => {
  const { service, sdk, calls } = setup();
  await service.register('player@example.invalid', 'short');
  assert.match(service.error(), /12 characters/); assert.equal(calls.length, 0);
  sdk.validatePassword = async () => ({ isValid: false, passwordPolicy: { customStrengthOptions: { minPasswordLength: 16, containsNumericCharacter: true } } } as any);
  await service.register('player@example.invalid', 'a long private passphrase');
  assert.match(service.error(), /16 characters.*a number/); assert.equal(calls.length, 0);
});
test('verification reloads the account and forces a fresh token before requesting the profile', async () => {
  const { service, sdk, emit, user, calls } = setup(); emit(user);
  sdk.reload = async () => { user.emailVerified = true; };
  await service.checkVerification();
  assert.equal(service.needsVerification(), false);
  assert.deepEqual(calls.map(c => c.name), ['token', 'api']); assert.equal(calls[0].args[0], true);
  assert.equal(service.profile()?.id, 'profile');
});
test('unverified existing sessions do not request app profiles and can resend email', async () => {
  const { service, emit, user, calls } = setup(); emit(user);
  await service.refreshProfile(); await service.checkVerification(); await service.resendVerification();
  assert.deepEqual(calls.map(c => c.name), ['reload', 'verify']); assert.equal(service.ready(), true);
});
test('verification email failure leaves a recoverable signed-in account', async () => {
  const { service, sdk } = setup();
  sdk.sendEmailVerification = async () => { throw { code: 'auth/network-request-failed' }; };
  await service.register('player@example.invalid', 'a long private passphrase');
  assert.equal(service.needsVerification(), true); assert.match(service.error(), /Account created, but/); assert.equal(service.busy(), false);
});
test('password reset gives the same response for existing and nonexistent accounts', async () => {
  const { service, sdk } = setup();
  await service.resetPassword('player@example.invalid'); const notice = service.notice();
  sdk.sendPasswordResetEmail = async () => { throw { code: 'auth/user-not-found' }; };
  await service.resetPassword('unknown@example.invalid');
  assert.equal(service.notice(), notice); assert.equal(service.error(), '');
});
test('sign-in errors use safe messages and Google remains available', async () => {
  const { service, sdk, calls } = setup();
  sdk.signInWithEmailAndPassword = async () => { throw { code: 'auth/invalid-credential', message: 'Sensitive provider detail' }; };
  await service.loginEmail('player@example.invalid', 'private'); assert.match(service.error(), /email or password is incorrect/);
  await service.login(); assert.equal(calls[0].name, 'google');
  assert.equal(message({ code: 'unknown', message: 'private' }), 'The request failed. Please try again.');
});
test('late profile responses cannot restore data after sign-out', async () => {
  const { service, emit, user, http } = setup(); const response = new Subject<any>();
  http.get = () => response as any; user.emailVerified = true; emit(user);
  emit(null); response.next({ id: 'private-profile' }); response.complete();
  await Promise.resolve(); assert.equal(service.profile(), null);
});


test('the credential form clears passwords before awaiting sign-in and never trims them', async () => {
  const calls: unknown[][] = [];
  let finish: () => void = () => {};
  const auth = { busy: signal(false), error: signal(''), notice: signal(''), loginEmail: async (...args: unknown[]) => { calls.push(args); await new Promise<void>(resolve => { finish = resolve; }); } };
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: auth }] });
  const component = runInInjectionContext(injector, () => new SignInComponent());
  component.email = 'player@example.invalid'; component.password = '  private passphrase  '; component.confirmation = 'transient';
  const pending = component.submit({ invalid: false } as NgForm);
  assert.equal(component.password, ''); assert.equal(component.confirmation, '');
  assert.deepEqual(calls[0], ['player@example.invalid', '  private passphrase  ']);
  finish(); await pending;
});
test('registration rejects mismatched confirmation and clears secrets on mode changes and destruction', async () => {
  let called = false;
  const auth = { busy: signal(false), error: signal(''), notice: signal(''), register: async () => { called = true; } };
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: auth }] });
  const component = runInInjectionContext(injector, () => new SignInComponent());
  component.mode = 'register'; component.password = 'a long private passphrase'; component.confirmation = 'mismatch';
  await component.submit({ invalid: false } as NgForm);
  assert.equal(called, false); assert.match(auth.error(), /do not match/);
  component.setMode('signin'); assert.equal(component.password, ''); assert.equal(component.confirmation, '');
  component.password = 'private'; component.ngOnDestroy(); assert.equal(component.password, '');
});
