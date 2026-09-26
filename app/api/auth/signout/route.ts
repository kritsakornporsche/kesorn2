import { NextResponse } from 'next/server';

function clearSessionAndRedirect(req: Request) {
  const url = new URL(req.url);
  const target = url.searchParams.get('callbackUrl') || '/signin';
  const redirectUrl = new URL(target, req.url);

  const response = NextResponse.redirect(redirectUrl);

  const cookiesToClear = [
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

  for (const cookieName of cookiesToClear) {
    response.cookies.set(cookieName, '', {
      path: '/',
      expires: new Date(0),
      maxAge: 0,
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
