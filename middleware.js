import { NextResponse } from 'next/server';
import { verifySession } from './lib/auth';

export const config = {
  matcher: ['/investigate/:path*', '/admin/:path*', '/api/case/:path*', '/api/corpus/:path*']
};

export async function middleware(request) {
  const token = request.cookies.get('session')?.value;
  const secret = process.env.SESSION_SECRET;

  const valid = Boolean(secret) && (await verifySession(token, secret));
  if (valid) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized — please log in.' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
