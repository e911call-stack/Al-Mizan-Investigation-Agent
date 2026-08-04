import { getSupabase, logAudit } from '../../../../../lib/supabase';
import { runFactConsistency } from '../../../../../lib/fact-consistency';
import { runCitationVerification } from '../../../../../lib/citation-verification';

// A Tier 1 edit (party name, date, amount) re-triggers Fact-Consistency
// and Citation Verification for real — not simulated. A free-text edit
// to the attorney's own drafted prose is not sent here at all; the
// frontend only calls this for Tier 1 field edits.
export async function POST(request, { params }) {
  const caseId = params.id;
  let body;
  try { body = await request.json(); } catch (e) { body = {}; }
  const { field, value } = body;

  let supabase;
  try { supabase = getSupabase(); } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }

  const { data: caseRow, error: fetchError } = await supabase.from('cases').select('*').eq('id', caseId).single();
  if (fetchError || !caseRow) return Response.json({ error: 'Case not found.' }, { status: 404 });

  const extracted = caseRow.extracted || {};
  if (field === 'partyName' && Array.isArray(extracted.parties) && extracted.parties[0]) {
    extracted.parties[0].name = value;
  }

  let factResult, citeResult;
  try {
    [factResult, citeResult] = await Promise.all([
      runFactConsistency(extracted),
      runCitationVerification((caseRow.research && caseRow.research.findings) || [])
    ]);
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }

  await supabase.from('cases').update({
    extracted,
    fact_consistency: factResult,
    citation_verification: citeResult,
    updated_at: new Date().toISOString()
  }).eq('id', caseId);

  await logAudit(supabase, caseId, 'Attorney edit', `Tier 1 field "${field}" edited — re-ran Fact-Consistency and Citation Verification.`);

  return Response.json({
    reverified: true,
    factConsistency: factResult,
    citationVerification: citeResult
  });
}
