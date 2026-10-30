import { next } from '@vercel/functions';

export const config = {
  matcher: ['/immo/:path*', '/argus-immo/:path*', '/immobilier/:path*', '/strategic-brussels/:path*', '/api/immo/:path*', '/api/bridge/:path*']
};

export default function middleware(request) {
  const expected = process.env.ARGUS_IMMO_PASSWORD;
  if (!expected) return new Response('Argus Immo temporarily unavailable: authentication not configured.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const header = request.headers.get('authorization') || '';
  let password = '';
  if (header.startsWith('Basic ')) {
    try {
      const credentials = atob(header.slice(6).trim());
      password = credentials.slice(credentials.indexOf(':') + 1);
    } catch {}
  }
  const a = new TextEncoder().encode(password);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  if (diff === 0) return next();
  return new Response('Accès privé ARGUS IMMO. Identifiez-vous avec le mot de passe partagé.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ARGUS IMMO", charset="UTF-8"', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }
  });
}
