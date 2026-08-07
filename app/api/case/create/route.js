import { getSupabase, logAudit } from '../../../../lib/supabase';
import { callClaudeTool } from '../../../../lib/claude';

const MAX_CASE_TEXT_CHARS = 20000;

const EXTRACT_TOOL = {
  name: 'extract_case_facts',
  description: 'Extract structured facts from a legal case narrative for intake into a case file.',
  input_schema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['ok', 'needs_clarification'], description: '"needs_clarification" if jurisdiction or parties/claim are too ambiguous to extract reliably.' },
      parties: {
        type: 'array',
        items: { type: 'object', properties: { role: { type: 'string' }, name: { type: 'string' } }, required: ['role', 'name'] }
      },
      claimType: { type: 'string' },
      reliefSought: { type: 'string', description: 'What the claimant is asking for, in one sentence, if stated in the text (e.g. damages of a stated amount, specific performance, rescission). Empty string if not stated.' },
      claimValueEstimate: { type: 'number' },
      claimValueCurrency: { type: 'string' },
      keyDates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string' },
            context: { type: 'string' },
            sourceAnchor: { type: 'string', description: 'A short verbatim excerpt from the input text.' }
          },
          required: ['date', 'context', 'sourceAnchor']
        }
      },
      jurisdictionSignal: { type: 'string', description: 'e.g. "jordan-civil". Empty string if not determinable.' },
      ambiguities: { type: 'array', items: { type: 'string' } }
    },
    required: ['status', 'parties', 'claimType', 'keyDates', 'jurisdictionSignal', 'ambiguities']
  }
};

const SYSTEM_PROMPT = `You are the Intake Agent in a legal case-investigation pipeline. Your only job is extraction — you do not give legal advice or infer facts not present in the text.

Rules:
- Extract only what the text actually says. Never invent names, dates, or amounts.
- Every date must include a short verbatim excerpt from the input as its sourceAnchor.
- If you cannot confidently determine the jurisdiction, or the parties/claim are too ambiguous, set status to "needs_clarification" and list specific questions in ambiguities.
- Always respond by calling the extract_case_facts tool. Never respond in plain text.`;

// Docket-style ID, e.g. "AM-2026-04217", with a retry loop so two cases can
// never collide on the same primary key. The year comes from the current date
// rather than being hardcoded.
async function generateCaseId(supabase) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `AM-${year}-${Math.floor(10000 + Math.random() * 89999)}`;
    const { data: existing } = await supabase.from('cases').select('id').eq('id', candidate).maybeSingle();
    if (!existing) return candidate;
  }
  throw new Error('Unable to allocate a unique case ID — please try again.');
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { body = {}; }

  const caseText = (body.caseFacts || '').trim();
  if (!caseText) {
    return Response.json({ error: 'caseFacts is required.' }, { status: 400 });
  }

  const truncated = caseText.length > MAX_CASE_TEXT_CHARS;
  const inputText = truncated ? caseText.slice(0, MAX_CASE_TEXT_CHARS) : caseText;

  let extracted;
  try {
    extracted = await callClaudeTool({
      system: SYSTEM_PROMPT,
      userContent: inputText,
      tool: EXTRACT_TOOL,
      maxTokens: 1500
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }

  let caseId;
  try {
    caseId = await generateCaseId(supabase);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
  const status = extracted.status === 'needs_clarification' ? 'needs_clarification' : 'processing';

  const { error: insertError } = await supabase.from('cases').insert({
    id: caseId,
    status,
    case_facts_raw: caseText,
    jurisdiction_signal: extracted.jurisdictionSignal || null,
    claim_type: extracted.claimType || null,
    claim_value_estimate: typeof extracted.claimValueEstimate === 'number' ? extracted.claimValueEstimate : null,
    claim_value_currency: extracted.claimValueCurrency || null,
    extracted
  });

  if (insertError) {
    return Response.json({ error: 'Failed to save case: ' + insertError.message }, { status: 500 });
  }

  await logAudit(supabase, caseId, 'Intake', extracted.status === 'ok'
    ? 'Extracted parties, claim, and dates with source anchors.'
    : 'Flagged ambiguities — awaiting clarification.');

  return Response.json({ caseId, status: extracted.status, extracted, truncated });
}
