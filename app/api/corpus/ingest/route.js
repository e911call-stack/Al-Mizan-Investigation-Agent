import { timingSafeEqual } from 'crypto';
import { getSupabase } from '../../../../lib/supabase';
import { splitLawIntoArticles } from '../../../../lib/corpus-ingest';
import { embedText } from '../../../../lib/embeddings';
import { storeProvision, embedAndCiteProvision, jurisdictionCodeFor } from '../../../../lib/lkc-sync';

// A law with 100+ articles means 100+ sequential embedding calls — this
// can run long. Same Vercel-plan caveat as the PDF report route: this
// only takes effect on Pro; Hobby stays capped at 10s regardless.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Voyage's free tier allows 3 requests/minute — one embedding call every
// ~20s stays under that without needing to add billing. A 429 here means
// the pause wasn't enough (e.g. a burst from a retried request); wait
// longer and try once more before giving up on that article.
const EMBED_PACING_MS = 22000;
const RATE_LIMIT_RETRY_MS = 60000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function embedWithPacing(text, isFirstCall) {
  if (!isFirstCall) await sleep(EMBED_PACING_MS);
  try {
    return await embedText(text);
  } catch (e) {
    if (String(e.message).includes('429') || /rate.?limit/i.test(e.message)) {
      await sleep(RATE_LIMIT_RETRY_MS);
      return await embedText(text); // single retry, then let it fail for real
    }
    throw e;
  }
}

// Constant-time comparison so a mistyped/attempted password can't be
// guessed faster by measuring response time differences.
function passwordMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// NOTE: this combined route still bundles splitting + embedding into one
// article-by-article loop — fine for a single law typed into the browser
// UI (app/admin/ingest-law), but for large batch backfills prefer the two
// separate routes (app/api/corpus/split then app/api/corpus/embed-pending),
// which don't force tiny chunk sizes to satisfy Voyage's pacing.
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

  const { jurisdiction, lawNameAr, lawNameEn, sourceNote, rawText } = body;
  if (!jurisdiction || !rawText) {
    return Response.json({ error: 'jurisdiction and rawText are required.' }, { status: 400 });
  }

  let supabase;
  try { supabase = getSupabase(); } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }

  let split;
  try {
    split = await splitLawIntoArticles(rawText);
  } catch (e) {
    return Response.json({ error: 'Splitting failed: ' + e.message }, { status: e.status || 500 });
  }

  const jurisdictionCode = jurisdictionCodeFor(jurisdiction);
  const results = [];
  for (let i = 0; i < split.articles.length; i++) {
    const article = split.articles[i];

    const stored = await storeProvision(supabase, {
      sourceJurisdiction: jurisdiction,
      lawNameAr: lawNameAr || 'Unnamed law',
      articleNumber: article.articleNumber,
      textAr: article.textAr,
    });
    if (!stored.stored) {
      results.push({ articleNumber: article.articleNumber, status: 'insert_failed', error: stored.reason });
      continue;
    }
    if (stored.alreadyExisted) {
      results.push({ articleNumber: article.articleNumber, status: 'already_stored' });
      continue;
    }

    let embedding;
    try {
      embedding = await embedWithPacing(article.textAr, i === 0);
    } catch (e) {
      results.push({ articleNumber: article.articleNumber, status: 'embedding_failed', error: e.message });
      continue;
    }

    const cited = await embedAndCiteProvision(supabase, {
      provisionId: stored.provisionId,
      jurisdictionCode,
      documentTitle: lawNameAr || 'Unnamed law',
      articleNo: article.articleNumber,
      versionId: stored.versionId,
      embedding,
    });

    results.push({
      articleNumber: article.articleNumber,
      status: cited.synced ? 'ok' : 'insert_failed',
      error: cited.synced ? undefined : cited.reason,
      extractionFlag: article.extractionFlag || undefined,
    });
  }

  const okCount = results.filter(r => r.status === 'ok' || r.status === 'already_stored').length;

  return Response.json({
    articlesFound: split.articles.length,
    strippedCommentaryCount: split.strippedCommentaryCount,
    okCount,
    results
  });
}
