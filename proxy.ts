import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js 16 Proxy (formerly Middleware)
 * Used for authentication, redirects, and role-based protection.
 */
export default function proxy(req: NextRequest) {
  const { nextUrl } = req;
  const protectedPrefixes = ['owner', 'tenant', 'keeper', 'platform', 'admin', 'researcher'];
  const pathParts = nextUrl.pathname.split('/');
  const currentPrefix = pathParts[1];

  if (protectedPrefixes.includes(currentPrefix)) {
    // Check for NextAuth session cookies
    const sessionToken = 
      req.cookies.get('authjs.session-token')?.value ||
      req.cookies.get('__Secure-authjs.session-token')?.value ||
      req.cookies.get('next-auth.session-token')?.value ||
      req.cookies.get('__Secure-next-auth.session-token')?.value;

    if (!sessionToken) {
      const signinUrl = new URL('/signin', req.url);
      signinUrl.searchParams.set('callbackUrl', nextUrl.pathname + nextUrl.search);
      return NextResponse.redirect(signinUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.json|up-logo.png|up-header.jpg).*)'],
};
