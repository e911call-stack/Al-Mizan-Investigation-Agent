import { getSupabase, logAudit } from '../../../../../lib/supabase';
import { getOptionalUser, actorFromUser } from '../../../../../lib/supabase-server';

export async function POST(request, { params }) {
  const caseId = params.id;

  const user = await getOptionalUser();
  if (!user) return Response.json({ error: 'Unauthorized — please log in.' }, { status: 401 });
  const actor = actorFromUser(user);

  let supabase;
  try { supabase = getSupabase(); } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }

  const { data: caseRow, error: fetchError } = await supabase.from('cases').select('owner_id').eq('id', caseId).single();
  if (fetchError || !caseRow) return Response.json({ error: 'Case not found.' }, { status: 404 });

  if (caseRow.owner_id && caseRow.owner_id !== user.id) {
    return Response.json({ error: 'Forbidden — you do not own this case.' }, { status: 403 });
  }

  const approvedAt = new Date().toISOString();
  const { error } = await supabase.from('cases').update({
    review_status: 'approved',
    status: 'approved',
    approved_at: approvedAt,
    updated_at: approvedAt
  }).eq('id', caseId);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, caseId, 'Attorney Review Gate', 'Case package approved by attorney. Not filed anywhere automatically.', actor);

  return Response.json({ approved: true, approvedAt });
}
