import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security headers on every page, including a Content Security Policy with a per-request nonce, so only
 * ECI-Hub's own scripts (and Stripe's, loaded by ours) can run. Pages for signed-in people are never cached.
 */
export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const https = (process.env.SITE_URL ?? '').startsWith('https://');
  const dev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.stripe.com",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com https://r.stripe.com https://merchant-ui-api.stripe.com",
    'frame-src https://js.stripe.com https://hooks.stripe.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()');
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  if (/^\/(account|admin|trainer|login|register|book|waitlist)(\/|$)/.test(req.nextUrl.pathname)) res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)'] };
