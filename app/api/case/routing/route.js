import { getSupabase, logAudit } from '../../../../lib/supabase';
import { STUB_FEE_TABLE, STUB_NOTICE } from '../../../../lib/stub-data';

// No Claude call here, deliberately — per the PRD, court/fee routing must
// be a table lookup, not free-form generation.

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { body = {}; }
  const caseId = body.caseId;
  if (!caseId) return Response.json({ error: 'caseId is required.' }, { status: 400 });

  let supabase;
  try { supabase = getSupabase(); } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }

  const { data: caseRow, error: fetchError } = await supabase.from('cases').select('*').eq('id', caseId).single();
  if (fetchError || !caseRow) return Response.json({ error: 'Case not found.' }, { status: 404 });

  const jurisdictionSignal = (caseRow.jurisdiction_signal || '').toLowerCase();
  const claimValue = caseRow.claim_value_estimate;

  let result;
  if (!jurisdictionSignal.startsWith('jordan')) {
    result = { status: 'no_table_for_jurisdiction', message: `No stub reference table available yet for jurisdiction "${jurisdictionSignal || 'unspecified'}".` };
  } else if (claimValue === null || claimValue === undefined) {
    result = { status: 'insufficient_data', message: 'No claim value was extracted by Intake — Court-Routing needs a claim value to look up the correct tier.' };
  } else {
    const tier = STUB_FEE_TABLE.tiers.find(t => claimValue <= t.maxValue);
    result = {
      status: 'ok',
      court: tier.court,
      fee: tier.fee,
      feeCurrency: tier.feeCurrency,
      basis: `Claim value ${claimValue} ${caseRow.claim_value_currency || ''} — table lookup`,
      lastVerifiedDate: STUB_FEE_TABLE.lastVerifiedDate,
      referenceOwner: STUB_FEE_TABLE.referenceOwner,
      stubNotice: STUB_NOTICE
    };
  }

  await supabase.from('cases').update({ routing: result, updated_at: new Date().toISOString() }).eq('id', caseId);
  await logAudit(supabase, caseId, 'Court-Routing', result.status === 'ok'
    ? `${result.court}, fee ${result.fee} ${result.feeCurrency} — table lookup.`
    : result.message);

  return Response.json(result);
}
