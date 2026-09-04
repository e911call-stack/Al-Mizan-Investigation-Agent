// =============================================================================
// Legal Knowledge Core — API key verification
// -----------------------------------------------------------------------------
// Separate from the app's Google-login gate (middleware.js) on purpose: LKC
// endpoints are meant to be called machine-to-machine by other apps
// (WakeelyPro, Mokhamen), not by a signed-in human browser session.
// =============================================================================

import { createHash } from 'crypto';

/**
 * Reads the x-api-key header, checks it against api_keys, and returns the
 * owning application row (including which jurisdictions/skills it may use)
 * or null if the key is missing/invalid/revoked.
 */
export async function verifyApiKey(supabase, request) {
  const rawKey = (request.headers.get('x-api-key') || '').trim();
  if (!rawKey) return { app: null, debug: 'no x-api-key header received' };

  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  const { data: key, error } = await supabase
    .from('api_keys')
    .select('application_id, status')
    .eq('key_hash', keyHash)
    .maybeSingle();
  if (error) {
    const cause = error.cause ? ` [cause: ${error.cause.code || error.cause.message || String(error.cause)}]` : '';
    return { app: null, debug: 'db error looking up key: ' + error.message + cause };
  }
  if (!key) return { app: null, debug: `no api_keys row for hash ${keyHash.slice(0, 12)}… (received key length: ${rawKey.length})` };
  if (key.status !== 'active') return { app: null, debug: `key found but status is "${key.status}"` };

  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select('id, name, jurisdictions_allowed, skills_allowed')
    .eq('id', key.application_id)
    .maybeSingle();
  if (appErr || !app) return { app: null, debug: 'application lookup failed: ' + (appErr?.message || 'not found') };

  return { app, debug: null };
}

/** True if this application is allowed to query the given jurisdiction. */
export function canAccessJurisdiction(app, jurisdictionCode) {
  return Array.isArray(app.jurisdictions_allowed) && app.jurisdictions_allowed.includes(jurisdictionCode);
}
