// =============================================================================
// Legal Knowledge Core (LKC) sync — two independent phases
// -----------------------------------------------------------------------------
// Phase 1 (storeProvision): text -> stored article row. No embedding API
// involved — cheap, fast, no rate-limit concerns. Called once per article
// after a single Gemini/Claude call has split a law's full text.
//
// Phase 2 (embedAndCiteProvision): one already-stored article -> embedding +
// citation. This is the ONLY phase that calls Voyage, so it's the only phase
// that needs pacing/rate-limit handling — kept fully separate from the
// splitting step so the two independent rate limits (LLM calls vs embedding
// calls) never compound into unworkably tiny chunks again.
//
//   - v1 is Jordan-only. Only jurisdiction === 'jordan-civil' is written.
//   - Only the Arabic title is stored on legal_documents.title for v1.
// =============================================================================

const JURISDICTION_MAP = {
  'jordan-civil': 'JO',
};

export function embeddingModelName() {
  switch (process.env.EMBED_PROVIDER || 'voyage') {
    case 'cohere': return 'embed-multilingual-v3.0';
    case 'huggingface': return 'BAAI/bge-m3';
    case 'voyage':
    default: return 'voyage-multilingual-2';
  }
}

export function jurisdictionCodeFor(sourceJurisdiction) {
  return JURISDICTION_MAP[sourceJurisdiction] || null;
}

/**
 * Phase 1: find/create the document + version for a law, and store one
 * article's text. No embedding, no citation yet — just the text safely
 * persisted. Skips (rather than duplicates) if this exact article_no
 * already exists for this law's version, so re-running a split is safe.
 *
 * Returns { stored: true, provisionId, alreadyExisted } or { stored: false, reason }.
 */
export async function storeProvision(supabase, {
  sourceJurisdiction,
  lawNameAr,
  articleNumber,
  textAr,
}) {
  const jurisdictionCode = jurisdictionCodeFor(sourceJurisdiction);
  if (!jurisdictionCode) {
    return { stored: false, reason: `jurisdiction "${sourceJurisdiction}" not yet active in LKC` };
  }

  try {
    let { data: doc, error: docErr } = await supabase
      .from('legal_documents')
      .select('id')
      .eq('jurisdiction_code', jurisdictionCode)
      .eq('title', lawNameAr)
      .maybeSingle();
    if (docErr) return { stored: false, reason: 'document lookup failed: ' + docErr.message };

    if (!doc) {
      const { data: newDoc, error: createDocErr } = await supabase
        .from('legal_documents')
        .insert({ jurisdiction_code: jurisdictionCode, doc_type: 'LAW', title: lawNameAr })
        .select('id')
        .single();
      if (createDocErr) return { stored: false, reason: 'document create failed: ' + createDocErr.message };
      doc = newDoc;
    }

    let { data: version, error: verErr } = await supabase
      .from('document_versions')
      .select('id')
      .eq('document_id', doc.id)
      .limit(1)
      .maybeSingle();
    if (verErr) return { stored: false, reason: 'version lookup failed: ' + verErr.message };

    if (!version) {
      const { data: newVersion, error: createVerErr } = await supabase
        .from('document_versions')
        .insert({ document_id: doc.id, status: 'extracted-unverified' })
        .select('id')
        .single();
      if (createVerErr) return { stored: false, reason: 'version create failed: ' + createVerErr.message };
      version = newVersion;
    }

    // Skip if this article was already stored by a previous (possibly
    // interrupted) run — makes re-running the split step idempotent.
    const { data: existing, error: existingErr } = await supabase
      .from('legal_provisions')
      .select('id')
      .eq('document_version_id', version.id)
      .eq('article_no', articleNumber)
      .maybeSingle();
    if (existingErr) return { stored: false, reason: 'existing-check failed: ' + existingErr.message };
    if (existing) return { stored: true, provisionId: existing.id, versionId: version.id, alreadyExisted: true };

    const { data: provision, error: provErr } = await supabase
      .from('legal_provisions')
      .insert({ document_version_id: version.id, article_no: articleNumber, provision_text: textAr })
      .select('id')
      .single();
    if (provErr) return { stored: false, reason: 'provision insert failed: ' + provErr.message };

    return { stored: true, provisionId: provision.id, versionId: version.id, alreadyExisted: false };
  } catch (e) {
    return { stored: false, reason: 'unexpected error: ' + (e?.message || String(e)) };
  }
}

/**
 * Phase 2: embed one already-stored provision and write its citation.
 * Call this with an embedding vector you've already computed (this
 * function makes no Voyage call itself — pacing/rate-limit handling for
 * that lives in the caller, e.g. the embed-pending route).
 */
export async function embedAndCiteProvision(supabase, {
  provisionId,
  jurisdictionCode,
  documentTitle,
  articleNo,
  versionId,
  embedding,
}) {
  try {
    const { error: embErr } = await supabase
      .from('embeddings')
      .insert({ provision_id: provisionId, vector: embedding, model_name: embeddingModelName() });
    if (embErr) return { synced: false, reason: 'embedding insert failed: ' + embErr.message };

    const { error: citeErr } = await supabase
      .from('legal_citations')
      .insert({
        provision_id: provisionId,
        jurisdiction_code: jurisdictionCode,
        document_title: documentTitle,
        article_no: articleNo,
        version_id: versionId,
      });
    if (citeErr) return { synced: false, reason: 'citation insert failed: ' + citeErr.message };

    return { synced: true };
  } catch (e) {
    return { synced: false, reason: 'unexpected error: ' + (e?.message || String(e)) };
  }
}
