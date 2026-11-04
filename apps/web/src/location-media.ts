export function googleEmbedUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 12000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['www.google.com', 'google.com'].includes(url.hostname) && url.pathname === '/maps/embed' && !!url.searchParams.get('pb') && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
export function googleDirectionsUrl(name: string, address: string) {
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent([name, address].filter(Boolean).join(', '));
}
