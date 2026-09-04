import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseUrl, supabaseAnonKey } from './lib/supabase-config';

export const config = {
  matcher: ['/investigate/:path*', '/api/case/:path*']
};

// Session gate: every matched route requires a valid Supabase Auth session.
// /admin/ingest-law and /api/corpus/ingest are deliberately NOT matched here —
// they use a simple shared password instead (see the password field on that
// page / the x-admin-password header check in that route), since Google
// OAuth setup is being deferred for now. /api/auth/* and /auth/* are also
// intentionally not matched so the OAuth handshake can complete before a
// session exists.
export async function middleware(request) {
  if (!supabaseUrl() || !supabaseAnonKey()) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Auth is not configured on the server. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' }, { status: 500 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized — please log in.' }, { status: 401 });
    }

    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
