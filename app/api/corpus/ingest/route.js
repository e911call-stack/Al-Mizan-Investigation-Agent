import { getSupabase } from '../../../../lib/supabase';
import { getOptionalUser, actorFromUser } from '../../../../lib/supabase-server';
import { splitLawIntoArticles } from '../../../../lib/corpus-ingest';
import { embedText } from '../../../../lib/embeddings';

// A law with 100+ articles means 100+ sequential embedding calls — this
// can run long. Same Vercel-plan caveat as the PDF report route: this
// only takes effect on Pro; Hobby stays capped at 10s regardless.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// POST /api/corpus/ingest
// Body: { jurisdiction, lawNameAr, lawNameEn, sourceNote, rawText }
//
// This is an admin/back-office operation, not something exposed in the
// attorney-facing app — see app/admin/ingest-law for the UI. Every entry
// this creates lands at tier 'extracted-unverified' by default; nothing
// gets promoted to 'corpus-verified' automatically. That promotion should
// be a deliberate, separate action once a human has actually checked an
// entry against an authoritative source.
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { body = {}; }

  const { jurisdiction, lawNameAr, lawNameEn, sourceNote, rawText } = body;
  if (!jurisdiction || !rawText) {
    return Response.json({ error: 'jurisdiction and rawText are required.' }, { status: 400 });
  }

  const user = await getOptionalUser();
  if (!user) return Response.json({ error: 'Unauthorized — please log in.' }, { status: 401 });
  const actor = actorFromUser(user);

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
    const citation = `${lawNameAr || 'Unnamed law'} — المادة ${article.articleNumber}`;
    let embedding;
    try {
      embedding = await embedText(article.textAr);
    } catch (e) {
      results.push({ articleNumber: article.articleNumber, status: 'embedding_failed', error: e.message });
      continue;
    }

    const { error: insertError } = await supabase.from('legal_corpus').insert({
      jurisdiction,
      law_name_ar: lawNameAr || null,
      law_name_en: lawNameEn || null,
      article_number: article.articleNumber,
      chapter: article.chapter || null,
      citation,
      text_ar: article.textAr,
      tier: 'extracted-unverified',
      source_note: [sourceNote, article.extractionFlag].filter(Boolean).join(' | ') || null,
      embedding
    });

    results.push({
      articleNumber: article.articleNumber,
      status: insertError ? 'insert_failed' : 'ok',
      error: insertError ? insertError.message : undefined,
      extractionFlag: article.extractionFlag || undefined
    });
  }

  // Record who ingested which law into the audit trail.
  const okCount = results.filter(r => r.status === 'ok').length;
  await supabase.from('audit_log').insert({
    case_id: null,
    agent: 'Corpus Ingestion',
    action: `Ingested "${lawNameAr || jurisdiction}" (${okCount}/${split.articles.length} articles).`,
    actor_id: actor?.id || null,
    actor_email: actor?.email || null,
    ts: new Date().toISOString()
  });

  return Response.json({
    articlesFound: split.articles.length,
    strippedCommentaryCount: split.strippedCommentaryCount,
    results
  });
}
