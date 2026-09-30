import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security headers on every response. The Content Security Policy allows the browser to reach
 * only this site and the Sealcode gateway (for the playground).
 */
export function proxy(_request: NextRequest) {
  const gateway = process.env.PUBLIC_GATEWAY_URL ?? 'http://localhost:8787';
  const dev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${gateway}${dev ? ' ws:' : ''}`,
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
