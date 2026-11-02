import { Injectable, InjectionToken, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { initializeApp, FirebaseOptions } from 'firebase/app';
import { Auth, GoogleAuthProvider, User, getAuth, onIdTokenChanged, signInWithPopup, signOut, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, reload, validatePassword } from 'firebase/auth';
import { defer, firstValueFrom, switchMap } from 'rxjs';

export interface RuntimeConfig { firebase: FirebaseOptions; authEmulatorUrl?: string; }
export const CONFIG = new InjectionToken<RuntimeConfig>('runtime config');
// Injectable SDK boundary lets local tests exercise authentication without contacting Firebase.
export const FIREBASE_AUTH_SDK = new InjectionToken('Firebase authentication SDK', { providedIn: 'root', factory: () => ({
  initializeApp, getAuth, onIdTokenChanged, signInWithPopup, signOut, connectAuthEmulator,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, reload, validatePassword
}) });
export interface Profile { id: string; displayName: string; email: string; role: 'PLAYER' | 'ORGANIZER' | 'ADMINISTRATOR'; }
export function message(error: unknown): string {
  if (error instanceof HttpErrorResponse) return error.status === 0 ? 'Cannot reach the API. Please try again.' : typeof error.error?.message === 'string' ? error.error.message : 'The request failed. Please try again.';
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Allow popups for this site and try again.',
    'auth/account-exists-with-different-credential': 'This email uses another sign-in provider. Use your original provider.',
    'auth/operation-not-allowed': 'This sign-in provider has not been enabled yet.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/user-not-found': 'The email or password is incorrect.',
    'auth/user-disabled': 'Unable to sign in with these details. Try resetting your password or contact the organizer.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/email-already-in-use': 'Unable to create an account with these details. Try signing in or resetting your password.',
    'auth/weak-password': 'Choose a stronger password that meets the password requirements.',
    'auth/password-does-not-meet-requirements': 'Your password does not meet the configured password requirements.',
    'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
    'auth/network-request-failed': 'Cannot reach sign-in. Check your connection and try again.',
    'auth/unauthorized-domain': 'This domain must be authorized in Firebase Authentication.'
  };
  return code && messages[code] || 'The request failed. Please try again.';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sdk = inject(FIREBASE_AUTH_SDK);
  private readonly config = inject(CONFIG);
  private readonly http = inject(HttpClient);
  private readonly auth: Auth | null;
  readonly profile = signal<Profile | null>(null);
  readonly firebaseUser = signal<User | null>(null, { equal: () => false });
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly needsVerification = computed(() => {
    const user = this.firebaseUser();
    return !!user && !user.emailVerified && user.providerData.some(provider => provider.providerId === 'password');
  });
  readonly configured: boolean;
  private revision = 0;
  constructor() {
    this.configured = !!(this.config.firebase.apiKey && this.config.firebase.authDomain && this.config.firebase.projectId && this.config.firebase.appId);
    this.auth = this.configured ? this.sdk.getAuth(this.sdk.initializeApp(this.config.firebase)) : null;
    if (!this.auth) { this.ready.set(true); return; }
    if (this.config.authEmulatorUrl) {
      const host = window.location.hostname;
      const url = new URL(this.config.authEmulatorUrl);
      if (!['localhost', '127.0.0.1'].includes(host) || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Auth emulator is allowed only on localhost.');
      this.sdk.connectAuthEmulator(this.auth, url.toString());
    }
    this.sdk.onIdTokenChanged(this.auth, (user: User | null) => {
      this.firebaseUser.set(user);
      this.profile.set(null);
      const revision = ++this.revision;
      if (user && !this.needsVerification()) void this.refreshProfile(revision);
      else this.ready.set(true);
    });
  }
  async token() { return this.auth?.currentUser?.getIdToken() ?? null; }
  private async action(work: (auth: Auth) => Promise<void>) {
    if (!this.auth || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try { await work(this.auth); }
    catch (error) { this.error.set(message(error)); }
    finally { this.busy.set(false); }
  }
  async login() {
    await this.action(async auth => { await this.sdk.signInWithPopup(auth, new GoogleAuthProvider()); });
  }
  async loginEmail(email: string, password: string) {
    // Passwords go only to Firebase's SDK, never to our API, browser storage, or logs.
    await this.action(async auth => { await this.sdk.signInWithEmailAndPassword(auth, email.trim(), password); });
  }
  async register(email: string, password: string) {
    await this.action(async auth => {
      if (password.length < 12) { this.error.set('Use at least 12 characters for your new password.'); return; }
      const policy = await this.sdk.validatePassword(auth, password);
      if (!policy.isValid) {
        const rules = policy.passwordPolicy.customStrengthOptions;
        const requirements = [
          `at least ${Math.max(12, rules.minPasswordLength ?? 12)} characters`,
          rules.maxPasswordLength ? `at most ${rules.maxPasswordLength} characters` : '',
          rules.containsLowercaseLetter ? 'a lowercase letter' : '',
          rules.containsUppercaseLetter ? 'an uppercase letter' : '',
          rules.containsNumericCharacter ? 'a number' : '',
          rules.containsNonAlphanumericCharacter ? 'a symbol' : ''
        ].filter(Boolean);
        this.error.set('Your new password must include ' + requirements.join(', ') + '.'); return;
      }
      const credential = await this.sdk.createUserWithEmailAndPassword(auth, email.trim(), password);
      // Account creation signs in automatically; the token listener keeps unverified users out of the API.
      this.firebaseUser.set(credential.user);
      try {
        await this.sdk.sendEmailVerification(credential.user);
        this.notice.set('Account created. Check your email, including spam, for a verification link.');
      } catch (error) {
        this.error.set('Account created, but the verification email could not be sent. ' + message(error));
      }
    });
  }
  async resetPassword(email: string) {
    await this.action(async auth => {
      try { await this.sdk.sendPasswordResetEmail(auth, email.trim()); }
      catch (error) {
        if ((error as { code?: string })?.code !== 'auth/user-not-found') throw error;
      }
      this.notice.set('If this address has an eligible account, a password reset email will arrive shortly. Check your inbox and spam folder.');
    });
  }
  async resendVerification() {
    await this.action(async auth => {
      const user = auth.currentUser;
      if (!user || user.emailVerified) return;
      await this.sdk.sendEmailVerification(user);
      this.notice.set('Verification email sent. Check your inbox and spam folder.');
    });
  }
  async checkVerification() {
    await this.action(async auth => {
      const user = auth.currentUser;
      if (!user) return;
      await this.sdk.reload(user);
      if (auth.currentUser?.uid !== user.uid) return;
      this.firebaseUser.set(user);
      if (!user.emailVerified) { this.notice.set('Your email is not verified yet. Open the link in your email, then try again.'); return; }
      await user.getIdToken(true);
      if (auth.currentUser?.uid === user.uid) await this.refreshProfile();
    });
  }
  async logout() {
    if (!this.auth) return;
    this.error.set(''); this.notice.set('');
    try { await this.sdk.signOut(this.auth); this.profile.set(null); }
    catch (error) { this.error.set(message(error)); }
  }
  async refreshProfile(revision = this.revision) {
    if (!this.auth?.currentUser || this.needsVerification()) return;
    this.error.set('');
    try {
      const profile = await firstValueFrom(this.http.get<Profile>('/api/me'));
      if (revision === this.revision) this.profile.set(profile);
    } catch (error) { if (revision === this.revision) this.error.set(message(error)); }
    finally { this.ready.set(true); }
  }
  async saveName(displayName: string) {
    const revision = this.revision;
    const profile = await firstValueFrom(this.http.patch<Profile>('/api/me', { displayName }));
    if (revision === this.revision) this.profile.set(profile);
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  if (!req.url.startsWith('/api/')) return next(req);
  return defer(() => auth.token()).pipe(switchMap(token => next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req)));
};
