import { getSupabase, logAudit } from '../../../../lib/supabase';
import { getOptionalUser, actorFromUser } from '../../../../lib/supabase-server';
import { STUB_FEE_TABLE, STUB_NOTICE } from '../../../../lib/stub-data';

// No Claude call here, deliberately — per the PRD, court/fee routing must
// be a table lookup, not free-form generation.

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { body = {}; }
  const caseId = body.caseId;
  if (!caseId) return Response.json({ error: 'caseId is required.' }, { status: 400 });

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

  const jurisdictionSignal = (caseRow.jurisdiction_signal || '').toLowerCase();
  const claimValue = caseRow.claim_value_estimate;

  let result;
  if (!jurisdictionSignal.startsWith('jordan')) {
    result = { status: 'no_table_for_jurisdiction', message: `No stub reference table available yet for jurisdiction "${jurisdictionSignal || 'unspecified'}".` };
  } else if (claimValue === null || claimValue === undefined) {
    result = { status: 'insufficient_data', message: 'No claim value was extracted by Intake — Court-Routing needs a claim value to look up the correct tier.' };
  } else if (typeof claimValue !== 'number' || !Number.isFinite(claimValue) || claimValue <= 0) {
    result = { status: 'insufficient_data', message: 'The claim value extracted by Intake is not a positive number — Court-Routing needs a valid claim value to look up the correct tier.' };
  } else {
    const tier = STUB_FEE_TABLE.tiers.find(t => claimValue <= t.maxValue);
    if (!tier) {
      result = { status: 'insufficient_data', message: 'The claim value is outside the range of the reference fee table.' };
    } else {
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
  }

  await supabase.from('cases').update({ routing: result, updated_at: new Date().toISOString() }).eq('id', caseId);
  await logAudit(supabase, caseId, 'Court-Routing', result.status === 'ok'
    ? `${result.court}, fee ${result.fee} ${result.feeCurrency} — table lookup.`
    : result.message, actor);

  return Response.json(result);
}
