import { timingSafeEqual } from 'crypto';
import { getSupabase } from '../../../../lib/supabase';
import { splitLawIntoArticles } from '../../../../lib/corpus-ingest';
import { storeProvision } from '../../../../lib/lkc-sync';

// This step only calls the LLM splitter (Gemini/Claude), never Voyage — so
// it can safely handle a much larger chunk of text per call than the old
// combined route could. One call per law (or per chapter for very long
// laws) rather than one call per 2 articles. See app/api/corpus/embed-pending
// for the separate, independently-paced embedding step.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function passwordMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// POST /api/corpus/split
// Headers: x-admin-password
// Body: { jurisdiction, lawNameAr, rawText }
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
  const { jurisdiction, lawNameAr, rawText } = body;
  if (!jurisdiction || !lawNameAr || !rawText) {
    return Response.json({ error: 'jurisdiction, lawNameAr, and rawText are required.' }, { status: 400 });
  }

  let supabase;
  try { supabase = getSupabase(); } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }

  let split;
  try {
    split = await splitLawIntoArticles(rawText);
  } catch (e) {
    return Response.json({ error: 'Splitting failed: ' + e.message }, { status: e.status || 500 });
  }

  const results = [];
  for (const article of split.articles) {
    const r = await storeProvision(supabase, {
      sourceJurisdiction: jurisdiction,
      lawNameAr,
      articleNumber: article.articleNumber,
      textAr: article.textAr,
    });
    results.push({
      articleNumber: article.articleNumber,
      status: r.stored ? (r.alreadyExisted ? 'already_stored' : 'stored') : 'failed',
      error: r.stored ? undefined : r.reason,
    });
  }

  const storedCount = results.filter(r => r.status === 'stored' || r.status === 'already_stored').length;

  return Response.json({
    articlesFound: split.articles.length,
    strippedCommentaryCount: split.strippedCommentaryCount,
    storedCount,
    results,
  });
}
