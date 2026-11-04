import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { DOCUMENT } from '@angular/common';
import { Injector, runInInjectionContext } from '@angular/core';
import { ThemeService } from '../src/theme.service';

function environment(saved: string | null, systemDark = false, blocked = false) {
  const mediaListeners = new Set<() => void>();
  const storageListeners = new Set<(event: Partial<StorageEvent>) => void>();
  const media = { matches: systemDark, addEventListener: (_: string, fn: () => void) => mediaListeners.add(fn), removeEventListener: (_: string, fn: () => void) => mediaListeners.delete(fn) };
  const storage = { getItem: () => { if (blocked) throw new Error('blocked'); return saved; }, setItem: (_: string, value: string) => { if (blocked) throw new Error('blocked'); saved = value; } };
  const window = { matchMedia: () => media, localStorage: storage, addEventListener: (_: string, fn: (event: Partial<StorageEvent>) => void) => storageListeners.add(fn), removeEventListener: (_: string, fn: (event: Partial<StorageEvent>) => void) => storageListeners.delete(fn) };
  const document = { documentElement: { dataset: {} as Record<string, string> }, defaultView: window };
  return { document, window, localStorage: storage, media, mediaListeners, storageListeners, saved: () => saved };
}
function start(env: ReturnType<typeof environment>) {
  const injector = Injector.create({ providers: [{ provide: DOCUMENT, useValue: env.document }] });
  const service = runInInjectionContext(injector, () => new ThemeService());
  return { service, destroy: () => { service.ngOnDestroy(); injector.destroy(); } };
}

test('theme follows the device until chosen, persists toggles and restores a saved preference', () => {
  const env = environment(null, true); const first = start(env);
  assert.equal(first.service.dark(), true); assert.equal(env.document.documentElement.dataset['theme'], 'dark');
  env.media.matches = false; env.mediaListeners.forEach(fn => fn()); assert.equal(first.service.dark(), false);
  first.service.toggle(); assert.equal(first.service.dark(), true); assert.equal(env.saved(), 'dark');
  env.mediaListeners.forEach(fn => fn()); assert.equal(first.service.dark(), true);
  first.destroy(); assert.equal(env.mediaListeners.size, 0); assert.equal(env.storageListeners.size, 0);
  const second = start(env); assert.equal(second.service.dark(), true); second.destroy();
});

test('theme tolerates blocked or invalid storage and synchronizes another tab or a cleared preference', () => {
  const blocked = environment(null, true, true); const first = start(blocked);
  assert.equal(first.service.dark(), true); assert.doesNotThrow(() => first.service.toggle()); assert.equal(first.service.dark(), false); first.destroy();
  const env = environment('invalid', false); const second = start(env); assert.equal(second.service.dark(), false);
  env.storageListeners.forEach(fn => fn({ key: 'unrelated', newValue: 'dark' })); assert.equal(second.service.dark(), false);
  env.storageListeners.forEach(fn => fn({ key: 'tri-city-theme', newValue: 'dark' })); assert.equal(second.service.dark(), true);
  env.storageListeners.forEach(fn => fn({ key: 'tri-city-theme', newValue: null })); assert.equal(second.service.dark(), false);
  env.media.matches = true; env.mediaListeners.forEach(fn => fn()); assert.equal(second.service.dark(), true); second.destroy();
});

test('early theme script agrees with the app before bootstrap, including storage failures', () => {
  const code = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
  for (const [saved, system, blocked, expected] of [
    ['light', true, false, 'light'], ['dark', false, false, 'dark'], [null, true, false, 'dark'],
    ['invalid', false, false, 'light'], [null, true, true, 'dark']
  ] as const) {
    const env = environment(saved, system, blocked); runInNewContext(code, env);
    assert.equal(env.document.documentElement.dataset['theme'], expected);
    const app = start(env); assert.equal(app.service.dark(), expected === 'dark'); app.destroy();
  }
});
