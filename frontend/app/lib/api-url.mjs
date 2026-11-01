/**
 * Resolve the Express API mount consistently for every browser workflow.
 * Accept either the backend origin or its /api URL; never duplicate the mount.
 * @param {string | undefined} configuredUrl
 * @param {boolean} production
 */
export function resolveApiBaseUrl(configuredUrl, production = false) {
  const value = configuredUrl?.trim();
  if (!value) {
    if (production) throw new Error('Set NEXT_PUBLIC_API_URL to the backend /api URL before building the frontend.');
    return 'http://localhost:4000/api';
  }
  let url;
  try { url = new URL(value); }
  catch { throw new Error('NEXT_PUBLIC_API_URL must be an absolute HTTP(S) backend URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_API_URL must be an HTTP(S) backend URL without credentials, a query or a fragment.');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  if (pathname && pathname !== '/api') {
    throw new Error('NEXT_PUBLIC_API_URL must contain only the backend origin or end in /api.');
  }
  return url.origin + '/api';
}
