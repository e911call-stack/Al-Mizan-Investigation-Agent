import { getSupabase } from '../../../../../lib/supabase';
import { verifyApiKey, canAccessJurisdiction } from '../../../../../lib/lkc-auth';
import { embedText } from '../../../../../lib/embeddings';

export const dynamic = 'force-dynamic';

// POST /api/v1/legal/search
// Headers: x-api-key: <application's LKC key>
// Body: { jurisdiction, query, current_only?, as_of_date? }
//
// Not behind the app's Google-login middleware (see lib/lkc-auth.js) — this
// is the machine-to-machine entry point other apps call.
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { body = {}; }

  const { jurisdiction, query, current_only = true, as_of_date = null } = body;
  if (!jurisdiction || !query) {
    return Response.json({ error: 'jurisdiction and query are required.' }, { status: 400 });
  }

  let supabase;
  try { supabase = getSupabase(); } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }

  const { app, debug } = await verifyApiKey(supabase, request);
  if (!app) {
    // TEMPORARY: includes a debug hint while we're setting this up.
    // Remove the debug field once keys are confirmed working end to end.
    return Response.json({ error: 'Invalid or missing API key.', debug }, { status: 401 });
  }
  if (!canAccessJurisdiction(app, jurisdiction)) {
    return Response.json({ error: `"${app.name}" is not authorized for jurisdiction "${jurisdiction}".` }, { status: 403 });
  }

  let queryEmbedding;
  try {
    queryEmbedding = await embedText(query);
  } catch (e) {
    return Response.json({ error: 'Embedding the query failed: ' + e.message }, { status: 500 });
  }

  const { data: results, error: searchErr } = await supabase.rpc('lkc_search_provisions', {
    query_embedding: queryEmbedding,
    query_text: query,
    p_jurisdiction: jurisdiction,
    p_current_only: current_only,
    p_as_of_date: as_of_date,
    match_count: 8,
  });

  if (searchErr) {
    return Response.json({ error: 'Search failed: ' + searchErr.message }, { status: 500 });
  }

  // Every result carries the full citation object — never just text.
  const citedResults = (results || []).map((r) => ({
    provision_text: r.provision_text,
    citation: {
      jurisdiction: r.jurisdiction_code,
      document: r.document_title,
      article: r.article_no,
      source_url: r.source_url,
      publication_date: r.publication_date,
      effective_date: r.effective_date,
    },
    relevance_score: r.score,
  }));

  return Response.json({
    query,
    jurisdiction,
    current_only,
    as_of_date,
    result_count: citedResults.length,
    results: citedResults,
  });
}
