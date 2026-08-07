import { getSupabase, logAudit } from '../../../../../lib/supabase';
import { getOptionalUser, actorFromUser } from '../../../../../lib/supabase-server';
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

  const user = await getOptionalUser();
  if (!user) return Response.json({ error: 'Unauthorized — please log in.' }, { status: 401 });
  const actor = actorFromUser(user);

  let supabase;
  try { supabase = getSupabase(); } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }

  const { data: caseRow, error: fetchError } = await supabase.from('cases').select('*').eq('id', caseId).single();
  if (fetchError || !caseRow) return Response.json({ error: 'Case not found.' }, { status: 404 });

  if (caseRow.owner_id && caseRow.owner_id !== user.id) {
    return Response.json({ error: 'Forbidden — you do not own this case.' }, { status: 403 });
  }

  const extracted = caseRow.extracted || {};
  if (field === 'partyName' && Array.isArray(extracted.parties) && extracted.parties[0]) {
    extracted.parties[0].name = value;
  }

  const research = caseRow.research || {};

  let factResult, citeResult;
  try {
    [factResult, citeResult] = await Promise.all([
      runFactConsistency(extracted),
      runCitationVerification(research.findings || [], research.corpusSource, supabase, caseRow.jurisdiction_signal)
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

  await logAudit(supabase, caseId, 'Attorney edit', `Tier 1 field "${field}" edited — re-ran Fact-Consistency and Citation Verification.`, actor);

  return Response.json({
    reverified: true,
    factConsistency: factResult,
    citationVerification: citeResult
  });
}
