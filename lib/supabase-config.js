// Edge/runtime-agnostic accessors for the public Supabase connection values.
// Kept free of Node imports so the same module can be used by Edge middleware,
// route handlers, and client components interchangeably.

const PUB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function supabaseUrl() {
  return PUB_URL;
}

export function supabaseAnonKey() {
  return PUB_ANON;
}

export function isSupabaseConfigured() {
  return Boolean(PUB_URL && PUB_ANON);
}