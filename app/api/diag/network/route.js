// TEMPORARY diagnostic route. GET this URL directly in the browser —
// no API key, no POST body needed. Delete this file once the
// "fetch failed" issue is resolved; it's not meant to stay in the app.
//
// Purpose: supabase-js catches network errors and re-wraps them into a
// plain object that loses the original error's `.cause` chain, which is
// exactly where the real reason ("ENOTFOUND", "ECONNREFUSED", a TLS
// problem, a timeout, etc.) lives. This route makes the same kind of
// request with plain fetch(), with nothing hiding the real error.

export const dynamic = 'force-dynamic';

function describeError(e, depth = 0) {
  if (!e || depth > 4) return null;
  const info = {
    name: e.name,
    message: e.message,
    code: e.code || e.cause?.code,
  };
  const nested = describeError(e.cause, depth + 1);
  if (nested) info.cause = nested;
  return info;
}

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const envCheck = {
    SUPABASE_URL_present: Boolean(url),
    SUPABASE_URL_preview: url ? url.slice(0, 30) + '…' : null,
    SUPABASE_SERVICE_ROLE_KEY_present: Boolean(key),
    SUPABASE_SERVICE_ROLE_KEY_length: key ? key.length : 0,
  };

  if (!url || !key) {
    return Response.json({ envCheck, result: 'Stopped — one of the two env vars above is missing.' });
  }

  let result;
  try {
    const started = Date.now();
    const res = await fetch(`${url}/rest/v1/applications?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const ms = Date.now() - started;
    const bodyText = await res.text();
    result = { ok: true, httpStatus: res.status, timeMs: ms, bodyPreview: bodyText.slice(0, 300) };
  } catch (e) {
    result = { ok: false, error: describeError(e) };
  }

  return Response.json({ envCheck, result });
}
