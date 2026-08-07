import { getSupabase, logAudit } from '../../../../lib/supabase';
import { getOptionalUser, actorFromUser } from '../../../../lib/supabase-server';
import { runFactConsistency } from '../../../../lib/fact-consistency';

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

  let result;
  try {
    result = await runFactConsistency(caseRow.extracted);
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }

  await supabase.from('cases').update({ fact_consistency: result, updated_at: new Date().toISOString() }).eq('id', caseId);
  await logAudit(supabase, caseId, 'Fact-Consistency', result.allPassed
    ? `Tier 1/2 facts consistent. Tier 3 note: ${result.tier3Note}`
    : `Tier 1 issues flagged: ${(result.tier1Issues || []).join('; ')}`, actor);

  return Response.json(result);
}
