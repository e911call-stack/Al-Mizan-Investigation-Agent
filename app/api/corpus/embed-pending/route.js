import { timingSafeEqual } from 'crypto';
import { getSupabase } from '../../../../lib/supabase';
import { embedText } from '../../../../lib/embeddings';
import { embedAndCiteProvision } from '../../../../lib/lkc-sync';

// The only route that calls Voyage. Kept separate from splitting on purpose
// (see app/api/corpus/split) so Gemini's call count no longer depends on
// Voyage's pacing needs. Call this repeatedly in a loop until
// remainingPending is 0 — each call processes a small batch (default 2,
// matching Voyage's free-tier ~3 RPM within the 60s function budget) and
// tells you how many are left.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const EMBED_PACING_MS = 22000;
const RATE_LIMIT_RETRY_MS = 60000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function passwordMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function embedWithPacing(text, isFirstCall) {
  if (!isFirstCall) await sleep(EMBED_PACING_MS);
  try {
    return await embedText(text);
  } catch (e) {
    if (String(e.message).includes('429') || /rate.?limit/i.test(e.message)) {
      await sleep(RATE_LIMIT_RETRY_MS);
      return await embedText(text);
    }
    throw e;
  }
}

// POST /api/corpus/embed-pending
// Headers: x-admin-password
// Body: { jurisdiction, batchSize? }  (batchSize default 2)
export async function POST(request) {
  const providedPassword = request.headers.get('x-admin-password');
  if (!process.env.ADMIN_PASSWORD) {
    return Response.json({ error: 'ADMIN_PASSWORD is not set on the server.' }, { status: 500 });
  }
  if (!passwordMatches(providedPassword, process.env.ADMIN_PASSWORD)) {
    return Response.json({ error: 'Wrong password.' }, { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch (e) { body = {}; }
  const { jurisdiction, batchSize = 2 } = body;
  if (!jurisdiction) {
    return Response.json({ error: 'jurisdiction is required.' }, { status: 400 });
  }

  let supabase;
  try { supabase = getSupabase(); } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }

  const { data: pending, error: pendErr } = await supabase.rpc('lkc_pending_provisions', {
    p_jurisdiction: jurisdiction,
    batch_size: batchSize,
  });
  if (pendErr) return Response.json({ error: 'Lookup failed: ' + pendErr.message }, { status: 500 });

  const results = [];
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    let embedding;
    try {
      embedding = await embedWithPacing(p.provision_text, i === 0);
    } catch (e) {
      results.push({ provisionId: p.provision_id, articleNo: p.article_no, status: 'embedding_failed', error: e.message });
      continue;
    }
    const r = await embedAndCiteProvision(supabase, {
      provisionId: p.provision_id,
      jurisdictionCode: p.jurisdiction_code,
      documentTitle: p.document_title,
      articleNo: p.article_no,
      versionId: p.version_id,
      embedding,
    });
    results.push({ provisionId: p.provision_id, articleNo: p.article_no, status: r.synced ? 'ok' : 'failed', error: r.synced ? undefined : r.reason });
  }

  const { data: remainingCount, error: countErr } = await supabase.rpc('lkc_pending_count', {
    p_jurisdiction: jurisdiction,
  });

  return Response.json({
    processedThisCall: results.length,
    results,
    remainingPending: countErr ? null : remainingCount,
  });
}
