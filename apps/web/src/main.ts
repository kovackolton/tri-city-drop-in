import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { CONFIG, RuntimeConfig, authInterceptor } from './auth.service';
import { AppComponent } from './app/app.component';

async function main() {
  let config: RuntimeConfig = { firebase: {} };
  try { const response = await fetch('/config.json', { cache: 'no-store' }); if (response.ok) config = await response.json(); } catch { /* Public browsing remains available without configuration. */ }
  if (!config?.firebase) config = { firebase: {} };
  await bootstrapApplication(AppComponent, { providers: [provideHttpClient(withInterceptors([authInterceptor])), { provide: CONFIG, useValue: config }] });
}
void main().catch(console.error);

