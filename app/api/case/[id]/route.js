import { getSupabase } from '../../../../lib/supabase';
import { getOptionalUser } from '../../../../lib/supabase-server';

const STAGE_NAMES = ['Intake', 'Research', 'Court-Routing', 'Drafting', 'Citation Verification', 'Fact-Consistency', 'Assembler', 'Attorney Review Gate'];
const MOCK_STAGE_MS = 1800; // pacing for the two stages that are still simulated (Drafting, Assembler)

export async function GET(request, { params }) {
  const caseId = params.id;

  const user = await getOptionalUser();
  if (!user) return Response.json({ error: 'Unauthorized — please log in.' }, { status: 401 });

  let supabase;
  try { supabase = getSupabase(); } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }

  const { data: caseRow, error } = await supabase.from('cases').select('*').eq('id', caseId).single();
  if (error || !caseRow) return Response.json({ error: 'Case not found.' }, { status: 404 });

  // Per-case authorization: only the owning attorney may view a case.
  if (caseRow.owner_id && caseRow.owner_id !== user.id) {
    return Response.json({ error: 'Forbidden — you do not own this case.' }, { status: 403 });
  }

  const { data: auditRows } = await supabase.from('audit_log').select('*').eq('case_id', caseId).order('ts', { ascending: true });

  const elapsed = Date.now() - new Date(caseRow.pipeline_started_at).getTime();

  const stages = STAGE_NAMES.map((name, i) => {
    let status = 'pending';
    if (i === 0) {
      status = 'done'; // Intake already happened by the time a case row exists
    } else if (i === 1 && caseRow.research) {
      status = caseRow.research.status === 'ok' ? 'done' : 'flag';
    } else if (i === 2 && caseRow.routing) {
      status = caseRow.routing.status === 'ok' ? 'done' : 'flag';
    } else if (i === 3) {
      status = elapsed > MOCK_STAGE_MS ? 'done' : 'running'; // Drafting — still mocked
    } else if (i === 4 && caseRow.citation_verification) {
      status = caseRow.citation_verification.allPassed ? 'done' : 'blocked';
    } else if (i === 5 && caseRow.fact_consistency) {
      status = caseRow.fact_consistency.allPassed ? 'flag' : 'blocked'; // Tier 3 note always advisory
    } else if (i === 6) {
      status = elapsed > MOCK_STAGE_MS * 2 ? 'done' : 'pending'; // Assembler — still mocked
    } else if (i === 7) {
      status = caseRow.review_status === 'approved' ? 'done' : 'running';
    }
    return { index: i, name, status };
  });

  return Response.json({ case: caseRow, stages, audit: auditRows || [] });
}
