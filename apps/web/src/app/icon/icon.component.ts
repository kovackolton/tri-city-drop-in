import { Component, Input } from '@angular/core';
@Component({
  selector: 'app-icon',
  template: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    @switch (name) {
      @case ('facebook') { <path fill="currentColor" stroke="none" d="M14 22v-9h3l.5-3.5H14V7.2c0-1 .3-1.7 1.8-1.7h1.9V2.3a25 25 0 0 0-2.8-.2C12.1 2.1 10.2 3.8 10.2 7v2.5H7V13h3.2v9Z"/> }
      @case ('instagram') { <rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/> }
      @case ('help') { <circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-2.9 2-2.9 4M12 17h.01"/> }
      @case ('calendar') { <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 11h18M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01"/> }
      @case ('ticket') { <path d="M4 5h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6V6a1 1 0 0 1 1-1Z"/><path d="M15 5v2m0 3v1m0 3v1m0 3v1"/> }
      @case ('refresh') { <path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1A8 8 0 0 1 19.4 9M4.6 15a8 8 0 0 0 13.3 2.9"/> }
      @case ('menu') { <path d="M4 6h16M4 12h16M4 18h16"/> }
      @case ('close') { <path d="m6 6 12 12M6 18 18 6"/> }
      @case ('bell') { <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/> }
      @case ('settings') { <path d="m9.5 3-.6 2.1-1.8 1-2.1-.5-2.5 4.3L4 11.5v2l-1.5 1.6 2.5 4.3 2.1-.5 1.8 1 .6 2.1h5l.6-2.1 1.8-1 2.1.5 2.5-4.3-1.5-1.6v-2l1.5-1.6L19 5.6l-2.1.5-1.8-1L14.5 3z"/><circle cx="12" cy="12.5" r="3"/> }
      @case ('sun') { <circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/> }
      @case ('moon') { <path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/> }
    }
  </svg>`,
  styles: [':host { display: inline-flex; flex-shrink: 0; }']
})
export class IconComponent { @Input({ required: true }) name!: 'bell' | 'settings' | 'sun' | 'moon' | 'menu' | 'close' | 'refresh' | 'calendar' | 'ticket' | 'help' | 'facebook' | 'instagram'; }
