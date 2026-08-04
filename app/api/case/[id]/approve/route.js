import { getSupabase, logAudit } from '../../../../../lib/supabase';

export async function POST(request, { params }) {
  const caseId = params.id;

  let supabase;
  try { supabase = getSupabase(); } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }

  const approvedAt = new Date().toISOString();
  const { error } = await supabase.from('cases').update({
    review_status: 'approved',
    status: 'approved',
    approved_at: approvedAt,
    updated_at: approvedAt
  }).eq('id', caseId);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, caseId, 'Attorney Review Gate', 'Case package approved by attorney. Not filed anywhere automatically.');

  return Response.json({ approved: true, approvedAt });
}
