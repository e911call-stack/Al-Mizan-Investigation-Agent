import { createClient } from '@supabase/supabase-js';

// Service role key — server-side only, never exposed to the browser.
// This intentionally bypasses RLS; the schema locks out anon access
// entirely, so this server client is the only path to the data.
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel -> Project -> Settings -> Environment Variables.'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function logAudit(supabase, caseId, agent, action) {
  await supabase.from('audit_log').insert({ case_id: caseId, agent, action });
}
