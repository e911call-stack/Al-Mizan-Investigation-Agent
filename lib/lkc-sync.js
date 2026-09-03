// =============================================================================
// Legal Knowledge Core (LKC) sync
// -----------------------------------------------------------------------------
// Mirrors a freshly ingested law article into the shared LKC tables
// (legal_documents / document_versions / legal_provisions / embeddings /
// legal_citations) so WakeelyPro and Mokhamen can eventually read this same
// corpus through the LKC API, instead of each app keeping its own copy.
//
// This is ADDITIVE and best-effort:
//   - It does NOT touch legal_corpus or the existing Research-agent retrieval
//     path (match_legal_corpus). Nothing here can break the working ingest
//     flow — every call is wrapped so an LKC-side failure just gets logged
//     and skipped, it never fails the request.
//   - v1 is Jordan-only (see the LKC PRD). Only jurisdiction === 'jordan-civil'
//     is synced — 'uae-mainland', 'uae-difc', 'egypt-civil', 'saudi' are
//     skipped because those jurisdiction rows don't exist in LKC yet.
//   - Only the Arabic title is stored on legal_documents.title for v1 —
//     adding a separate English-title column is a small follow-up migration,
//     not needed for the pipeline to work.
// =============================================================================

const JURISDICTION_MAP = {
  'jordan-civil': 'JO',
};

function embeddingModelName() {
  switch (process.env.EMBED_PROVIDER || 'voyage') {
    case 'cohere': return 'embed-multilingual-v3.0';
    case 'huggingface': return 'BAAI/bge-m3';
    case 'voyage':
    default: return 'voyage-multilingual-2';
  }
}

/**
 * Sync one already-embedded article into the LKC schema. Call this once per
 * article, right after it's been inserted into legal_corpus (reuses the same
 * embedding vector — no extra embedding-API cost).
 *
 * Returns { synced: true } on success, { synced: false, reason } otherwise.
 * Never throws — the caller should not need a try/catch.
 */
export async function syncArticleToLKC(supabase, {
  sourceJurisdiction,
  lawNameAr,
  articleNumber,
  textAr,
  embedding,
  sourceNote,
}) {
  const jurisdictionCode = JURISDICTION_MAP[sourceJurisdiction];
  if (!jurisdictionCode) {
    return { synced: false, reason: `jurisdiction "${sourceJurisdiction}" not yet active in LKC` };
  }

  try {
    // 1. Find or create the legal_documents row for this law.
    let { data: doc, error: docErr } = await supabase
      .from('legal_documents')
      .select('id')
      .eq('jurisdiction_code', jurisdictionCode)
      .eq('title', lawNameAr)
      .maybeSingle();
    if (docErr) return { synced: false, reason: 'document lookup failed: ' + docErr.message };

    if (!doc) {
      const { data: newDoc, error: createDocErr } = await supabase
        .from('legal_documents')
        .insert({ jurisdiction_code: jurisdictionCode, doc_type: 'LAW', title: lawNameAr })
        .select('id')
        .single();
      if (createDocErr) return { synced: false, reason: 'document create failed: ' + createDocErr.message };
      doc = newDoc;
    }

    // 2. Find or create the (single, v1) document_versions row for this law.
    let { data: version, error: verErr } = await supabase
      .from('document_versions')
      .select('id')
      .eq('document_id', doc.id)
      .limit(1)
      .maybeSingle();
    if (verErr) return { synced: false, reason: 'version lookup failed: ' + verErr.message };

    if (!version) {
      const { data: newVersion, error: createVerErr } = await supabase
        .from('document_versions')
        .insert({ document_id: doc.id, status: 'extracted-unverified' })
        .select('id')
        .single();
      if (createVerErr) return { synced: false, reason: 'version create failed: ' + createVerErr.message };
      version = newVersion;
    }

    // 3. Insert the provision (article) row.
    const { data: provision, error: provErr } = await supabase
      .from('legal_provisions')
      .insert({
        document_version_id: version.id,
        article_no: articleNumber,
        provision_text: textAr,
      })
      .select('id')
      .single();
    if (provErr) return { synced: false, reason: 'provision insert failed: ' + provErr.message };

    // 4. Insert the embedding (reusing the vector already computed for legal_corpus).
    const { error: embErr } = await supabase
      .from('embeddings')
      .insert({ provision_id: provision.id, vector: embedding, model_name: embeddingModelName() });
    if (embErr) return { synced: false, reason: 'embedding insert failed: ' + embErr.message };

    // 5. Insert the citation object every LKC answer will point back to.
    const { error: citeErr } = await supabase
      .from('legal_citations')
      .insert({
        provision_id: provision.id,
        jurisdiction_code: jurisdictionCode,
        document_title: lawNameAr,
        article_no: articleNumber,
        version_id: version.id,
      });
    if (citeErr) return { synced: false, reason: 'citation insert failed: ' + citeErr.message };

    return { synced: true };
  } catch (e) {
    return { synced: false, reason: 'unexpected error: ' + (e?.message || String(e)) };
  }
}
