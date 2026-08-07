// Server-side Supabase client bound to the incoming request cookies. Used by
// route handlers and server components to read the authenticated user and to
// persist the session cookie on login/callback/logout.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseUrl, supabaseAnonKey } from './supabase-config';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component that cannot set cookies during
          // render — fine, the middleware refreshes them on the next request.
        }
      }
    }
  });
}

// Returns the signed-in user for the current request, or null. Throws only if
// Supabase client env vars are missing.
export async function getCurrentUser() {
  if (!supabaseUrl() || !supabaseAnonKey()) {
    throw new Error('Supabase auth is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Convenience for route handlers: returns the user or null (caller decides the
// HTTP status) — no exceptions for the unauth case.
export async function getOptionalUser() {
  try {
    return await getCurrentUser();
  } catch (e) {
    return null;
  }
}

// A small envelope for the audit log: the actor's id and (best-effort) name.
export function actorFromUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email || user.user_metadata?.email || null,
    name: user.user_metadata?.name || user.user_metadata?.full_name || null
  };
}