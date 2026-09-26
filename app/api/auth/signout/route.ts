import { NextResponse } from 'next/server';

function clearSessionAndRedirect(req: Request) {
  const url = new URL(req.url);
  const target = url.searchParams.get('callbackUrl') || '/';
  const redirectUrl = new URL(target, req.url);

  // Check if client expects JSON (e.g. client fetch call)
  const isJsonExpected = req.headers.get('accept')?.includes('application/json') || 
                         req.headers.get('content-type')?.includes('application/json');

  const response = isJsonExpected 
    ? NextResponse.json({ success: true, redirectUrl: redirectUrl.toString() })
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
  return clearSessionAndRedirect(req);
}

export async function POST(req: Request) {
  return clearSessionAndRedirect(req);
}
