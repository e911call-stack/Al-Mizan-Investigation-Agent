import { timingSafeEqual } from 'crypto';
import { getSupabase } from '../../../../lib/supabase';
import { splitLawIntoArticles } from '../../../../lib/corpus-ingest';
import { embedText } from '../../../../lib/embeddings';
import { syncArticleToLKC } from '../../../../lib/lkc-sync';

// A law with 100+ articles means 100+ sequential embedding calls — this
// can run long. Same Vercel-plan caveat as the PDF report route: this
// only takes effect on Pro; Hobby stays capped at 10s regardless.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Constant-time comparison so a mistyped/attempted password can't be
// guessed faster by measuring response time differences.
function passwordMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// POST /api/corpus/ingest
// Headers: x-admin-password: <the shared password set in ADMIN_PASSWORD>
// Body: { jurisdiction, lawNameAr, lawNameEn, sourceNote, rawText }
//
// This is an admin/back-office operation, not something exposed in the
// attorney-facing app — see app/admin/ingest-law for the UI. Every entry
// this creates lands at status 'extracted-unverified' by default; nothing
// gets promoted to 'corpus-verified' automatically. That promotion should
// be a deliberate, separate action once a human has actually checked an
// entry against an authoritative source.
//
// Writes go directly into the shared Legal Knowledge Core tables
// (legal_documents / document_versions / legal_provisions / embeddings /
// legal_citations) — this is now the one real place ingested law lives.
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

  const results = [];
  for (const article of split.articles) {
    let embedding;
    try {
      embedding = await embedText(article.textAr);
    } catch (e) {
      results.push({ articleNumber: article.articleNumber, status: 'embedding_failed', error: e.message });
      continue;
    }

    const lkc = await syncArticleToLKC(supabase, {
      sourceJurisdiction: jurisdiction,
      lawNameAr: lawNameAr || 'Unnamed law',
      articleNumber: article.articleNumber,
      textAr: article.textAr,
      embedding,
      sourceNote,
    });

    results.push({
      articleNumber: article.articleNumber,
      status: lkc.synced ? 'ok' : 'insert_failed',
      error: lkc.synced ? undefined : lkc.reason,
      extractionFlag: article.extractionFlag || undefined,
    });
  }

  const okCount = results.filter(r => r.status === 'ok').length;

  return Response.json({
    articlesFound: split.articles.length,
    strippedCommentaryCount: split.strippedCommentaryCount,
    okCount,
    results
  });
}
