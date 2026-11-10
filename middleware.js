import { next } from '@vercel/functions';

// Fail closed: BRIDGE must never serve private real-estate data without authentication.
// This is a temporary Basic Auth gate; use Vercel Authentication / SSO for production.
export const config = { matcher: ['/:path*'] };

export default function middleware(request) {
  const secret = String(process.env.BRIDGE_ACCESS_PASSWORD || '');
  if (secret.length < 24) return new Response('BRIDGE is not configured', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const header = request.headers.get('authorization') || '';
  let supplied = '';
  if (header.startsWith('Basic ')) {
    try {
      const raw = atob(header.slice(6).trim());
      supplied = raw.slice(raw.indexOf(':') + 1);
    } catch {}
  }
  const a = new TextEncoder().encode(supplied);
  const b = new TextEncoder().encode(secret);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  if (diff !== 0) return new Response('BRIDGE — restricted access', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="BRIDGE"', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  return next();
}
