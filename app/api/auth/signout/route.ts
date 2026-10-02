import { NextResponse } from 'next/server';

async function clearSessionAndRespond(req: Request) {
  const url = new URL(req.url);
  let target = url.searchParams.get('callbackUrl') || '';

  const contentType = req.headers.get('content-type') || '';
  const acceptHeader = req.headers.get('accept') || '';
  const isReturnRedirect = req.headers.get('x-auth-return-redirect') === '1';

  // Read callbackUrl from body if POST
  if (req.method === 'POST') {
    try {
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const bodyText = await req.text();
        const params = new URLSearchParams(bodyText);
        target = params.get('callbackUrl') || target;
      } else if (contentType.includes('application/json')) {
        const bodyJson = await req.json();
        target = bodyJson?.callbackUrl || target;
      }
    } catch {
      // Ignore body parse errors
    }
  }

  if (!target) target = '/signin';

  const redirectUrl = new URL(target, req.url);

  // NextAuth signOut() sends POST with X-Auth-Return-Redirect: 1 and expects JSON { url: "..." }
  const isJsonExpected = isReturnRedirect ||
                         req.method === 'POST' ||
                         acceptHeader.includes('application/json') ||
                         contentType.includes('application/json');

  const response = isJsonExpected
    ? NextResponse.json({
        url: redirectUrl.toString(),
        redirectUrl: redirectUrl.toString(),
        success: true
      }, { status: 200 })
    : NextResponse.redirect(redirectUrl);

  const baseCookiesToClear = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
    'authjs.csrf-token',
    '__Host-authjs.csrf-token',
    'next-auth.csrf-token',
    'authjs.callback-url',
    'next-auth.callback-url',
  ];

  // Dynamically discover all session/auth/chunked cookies from incoming request headers
  const cookieHeader = req.headers.get('cookie') || '';
  const incomingCookieNames = cookieHeader
    .split(';')
    .map(c => c.trim().split('=')[0])
    .filter(Boolean);

  const authRelatedCookies = incomingCookieNames.filter(name => 
    name.includes('session-token') || 
    name.includes('authjs') || 
    name.includes('next-auth') || 
    name.includes('csrf')
  );

  // Combine known cookie names, incoming cookies, and chunk patterns (0-9)
  const allCookiesToClear = new Set<string>([
    ...baseCookiesToClear,
    ...authRelatedCookies,
  ]);

  for (let i = 0; i <= 9; i++) {
    allCookiesToClear.add(`authjs.session-token.${i}`);
    allCookiesToClear.add(`__Secure-authjs.session-token.${i}`);
    allCookiesToClear.add(`next-auth.session-token.${i}`);
    allCookiesToClear.add(`__Secure-next-auth.session-token.${i}`);
  }

  const isHttps = req.url.startsWith('https:');

  for (const cookieName of allCookiesToClear) {
    const isSecurePrefix = cookieName.startsWith('__Secure-') || cookieName.startsWith('__Host-');
    
    // Clear on root path with appropriate secure flags
    response.cookies.set(cookieName, '', {
      path: '/',
      expires: new Date(0),
      maxAge: 0,
      secure: isSecurePrefix || isHttps,
      sameSite: 'lax',
    });
  }

  return response;
}

export async function GET(req: Request) {
  return clearSessionAndRespond(req);
}

export async function POST(req: Request) {
  return clearSessionAndRespond(req);
}
