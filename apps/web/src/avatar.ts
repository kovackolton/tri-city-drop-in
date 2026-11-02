export const avatarColors = [
  { id: 'emerald', label: 'Forest', background: '#d1fae5', foreground: '#065f46' },
  { id: 'teal', label: 'Teal', background: '#ccfbf1', foreground: '#115e59' },
  { id: 'sky', label: 'Sky', background: '#e0f2fe', foreground: '#075985' },
  { id: 'indigo', label: 'Indigo', background: '#e0e7ff', foreground: '#3730a3' },
  { id: 'violet', label: 'Violet', background: '#ede9fe', foreground: '#5b21b6' },
  { id: 'rose', label: 'Rose', background: '#ffe4e6', foreground: '#9f1239' },
  { id: 'amber', label: 'Amber', background: '#fef3c7', foreground: '#92400e' },
  { id: 'slate', label: 'Slate', background: '#e2e8f0', foreground: '#334155' }
] as const;
export function avatarInitial(name: string | null | undefined) { return Array.from(name?.trim() || '?')[0].toLocaleUpperCase(); }
export function avatarPalette(color: string | null | undefined) { return avatarColors.find(option => option.id === color) ?? avatarColors[0]; }
export function contactEmailLink(email: string) { return 'mailto:' + encodeURIComponent(email); }
export function contactPhoneLink(phone: string) { return 'tel:' + phone.replace(/[^+0-9]/g, ''); }
