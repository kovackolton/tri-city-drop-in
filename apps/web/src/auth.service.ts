import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { initializeApp, FirebaseOptions } from 'firebase/app';
import { Auth, FacebookAuthProvider, GoogleAuthProvider, User, getAuth, onIdTokenChanged, signInWithPopup, signOut, connectAuthEmulator } from 'firebase/auth';
import { defer, firstValueFrom, switchMap } from 'rxjs';

export interface RuntimeConfig { firebase: FirebaseOptions; authEmulatorUrl?: string; }
export const CONFIG = new InjectionToken<RuntimeConfig>('runtime config');
export interface Profile { id: string; displayName: string; email: string; role: 'PLAYER' | 'ORGANIZER' | 'ADMINISTRATOR'; }
export function message(error: unknown): string {
  if (error instanceof HttpErrorResponse) return error.status === 0 ? 'Cannot reach the API. Please try again.' : typeof error.error?.message === 'string' ? error.error.message : 'The request failed. Please try again.';
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Allow popups for this site and try again.',
    'auth/account-exists-with-different-credential': 'This email uses another sign-in provider. Use your original provider.',
    'auth/operation-not-allowed': 'This sign-in provider has not been enabled yet.',
    'auth/unauthorized-domain': 'This domain must be authorized in Firebase Authentication.'
  };
  return code && messages[code] || 'The request failed. Please try again.';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly config = inject(CONFIG);
  private readonly http = inject(HttpClient);
  private readonly auth: Auth | null;
  readonly profile = signal<Profile | null>(null);
  readonly firebaseUser = signal<User | null>(null);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly configured: boolean;
  private revision = 0;
  constructor() {
    this.configured = !!(this.config.firebase.apiKey && this.config.firebase.authDomain && this.config.firebase.projectId && this.config.firebase.appId);
    this.auth = this.configured ? getAuth(initializeApp(this.config.firebase)) : null;
    if (!this.auth) { this.ready.set(true); return; }
    if (this.config.authEmulatorUrl) {
      const host = window.location.hostname;
      const url = new URL(this.config.authEmulatorUrl);
      if (!['localhost', '127.0.0.1'].includes(host) || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Auth emulator is allowed only on localhost.');
      connectAuthEmulator(this.auth, url.toString());
    }
    onIdTokenChanged(this.auth, (user: User | null) => {
      this.firebaseUser.set(user);
      this.profile.set(null);
      const revision = ++this.revision;
      if (user) void this.refreshProfile(revision);
      else this.ready.set(true);
    });
  }
  async token() { return this.auth?.currentUser?.getIdToken() ?? null; }
  async login(provider: 'google' | 'facebook') {
    if (!this.auth || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await signInWithPopup(this.auth, provider === 'google' ? new GoogleAuthProvider() : new FacebookAuthProvider()); }
    catch (error) { this.error.set(message(error)); }
    finally { this.busy.set(false); }
  }
  async logout() {
    if (!this.auth) return;
    this.error.set('');
    try { await signOut(this.auth); this.profile.set(null); }
    catch (error) { this.error.set(message(error)); }
  }
  async refreshProfile(revision = this.revision) {
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
