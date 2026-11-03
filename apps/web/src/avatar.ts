export const avatarColors = [
  { id: 'emerald', label: 'Forest', background: 'var(--avatar-emerald-bg)', foreground: 'var(--avatar-emerald-text)' },
  { id: 'teal', label: 'Teal', background: 'var(--avatar-teal-bg)', foreground: 'var(--avatar-teal-text)' },
  { id: 'sky', label: 'Sky', background: 'var(--avatar-sky-bg)', foreground: 'var(--avatar-sky-text)' },
  { id: 'indigo', label: 'Indigo', background: 'var(--avatar-indigo-bg)', foreground: 'var(--avatar-indigo-text)' },
  { id: 'violet', label: 'Violet', background: 'var(--avatar-violet-bg)', foreground: 'var(--avatar-violet-text)' },
  { id: 'rose', label: 'Rose', background: 'var(--avatar-rose-bg)', foreground: 'var(--avatar-rose-text)' },
  { id: 'amber', label: 'Amber', background: 'var(--avatar-amber-bg)', foreground: 'var(--avatar-amber-text)' },
  { id: 'slate', label: 'Slate', background: 'var(--avatar-slate-bg)', foreground: 'var(--avatar-slate-text)' }
] as const;
export function avatarInitial(name: string | null | undefined) { return Array.from(name?.trim() || '?')[0].toLocaleUpperCase(); }
export function avatarPalette(color: string | null | undefined) { return avatarColors.find(option => option.id === color) ?? avatarColors[0]; }
export function contactEmailLink(email: string) { return 'mailto:' + encodeURIComponent(email); }
export function contactPhoneLink(phone: string) { return 'tel:' + phone.replace(/[^+0-9]/g, ''); }
