export type PaymentMethod = 'venmo' | 'cashapp' | 'paypal';
export function paymentProfileUrl(value: unknown, method: PaymentMethod): string | null {
  if (typeof value !== 'string' || value.length > 2048 || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
    const handle = '[A-Za-z0-9_-]{1,80}';
    if (method === 'venmo' && ['venmo.com', 'www.venmo.com', 'account.venmo.com'].includes(url.hostname)) {
      const match = new RegExp(`^/u/(${handle})/?$`).exec(url.pathname); return match ? `https://venmo.com/u/${match[1]}` : null;
    }
    if (method === 'cashapp' && url.hostname === 'cash.app') {
      const match = new RegExp(`^/\\$(${handle})/?$`).exec(url.pathname); return match ? `https://cash.app/$${match[1]}` : null;
    }
    if (method === 'paypal') {
      const pattern = ['paypal.me', 'www.paypal.me'].includes(url.hostname) ? `^/(${handle})/?$` : ['paypal.com', 'www.paypal.com'].includes(url.hostname) ? `^/paypalme/(${handle})/?$` : null;
      const match = pattern ? new RegExp(pattern).exec(url.pathname) : null; return match ? `https://paypal.me/${match[1]}` : null;
    }
    return null;
  } catch { return null; }
}
