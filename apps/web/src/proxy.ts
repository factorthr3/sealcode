import { NextResponse, type NextRequest } from 'next/server';

/** Routes that can carry IDs or tokens in their URLs. Analytics is never allowed on these. */
const PRIVATE_PREFIXES = [
  '/app',
  '/staff',
  '/auth',
  '/login',
  '/signup',
  '/onboarding',
  '/invite',
  '/device',
  '/api',
];

/** Google Analytics hosts, allowed on public pages only (loaded after cookie consent). */
const GA_SCRIPT = ' https://*.googletagmanager.com';
const GA_CONNECT =
  ' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com';
const GA_IMG = ' https://*.google-analytics.com https://*.googletagmanager.com';

/**
 * Security headers on every response. The Content Security Policy allows the browser to reach
 * only this site and the Sealcode gateway (for the playground), plus Google Analytics on public
 * pages.
 */
export function proxy(request: NextRequest) {
  const gateway = process.env.PUBLIC_GATEWAY_URL ?? 'http://localhost:8787';
  const dev = process.env.NODE_ENV !== 'production';
  const path = request.nextUrl.pathname;
  const ga = !PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}${ga ? GA_SCRIPT : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data:${ga ? GA_IMG : ''}`,
    "font-src 'self'",
    `connect-src 'self' ${gateway}${dev ? ' ws:' : ''}${ga ? GA_CONNECT : ''}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  const res = NextResponse.next();
  res.headers.set('content-security-policy', csp);
  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  res.headers.set('x-frame-options', 'DENY');
  res.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (!dev) res.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
