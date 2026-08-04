import { getSupabase, logAudit } from '../../../../lib/supabase';
import { callClaudeTool } from '../../../../lib/claude';
import { STUB_CORPUS, STUB_NOTICE } from '../../../../lib/stub-data';

const SELECT_TOOL = {
  name: 'select_relevant_authority',
  description: 'Select which corpus entries (by id) are relevant to the case, using only the ids provided.',
  input_schema: {
    type: 'object',
    properties: {
      noMatch: { type: 'boolean' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            citationId: { type: 'string', description: 'Must be one of the ids given. Never invent an id.' },
            relevanceNote: { type: 'string' }
          },
          required: ['citationId', 'relevanceNote']
        }
      }
    },
    required: ['noMatch', 'findings']
  }
};

function systemPrompt(corpusListText) {
  return `You are the Research Agent in a legal case-investigation pipeline. You may ONLY select citationId values from the list below — never invent one. If nothing is relevant, set noMatch true and return an empty findings array.

Corpus entries available:
${corpusListText}

Always respond by calling the select_relevant_authority tool.`;
}

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
  const relevantCorpus = STUB_CORPUS.filter(c => jurisdictionSignal.startsWith('jordan') && c.jurisdiction === 'jordan-civil');

  if (relevantCorpus.length === 0) {
    const result = {
      status: 'no_corpus_for_jurisdiction',
      findings: [],
      stubNotice: STUB_NOTICE,
      message: `No stub corpus available yet for jurisdiction "${jurisdictionSignal || 'unspecified'}".`
    };
    await supabase.from('cases').update({ research: result, updated_at: new Date().toISOString() }).eq('id', caseId);
    await logAudit(supabase, caseId, 'Research', result.message);
    return Response.json(result);
  }

  const corpusListText = relevantCorpus.map(c => `- id: ${c.id} | ${c.citation} | ${c.summary}`).join('\n');

  let selection;
  try {
    selection = await callClaudeTool({
      system: systemPrompt(corpusListText),
      userContent: `Claim type: ${caseRow.claim_type}\nJurisdiction: ${jurisdictionSignal}`,
      tool: SELECT_TOOL
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }

  const findings = (selection.findings || [])
    .map(f => {
      const entry = relevantCorpus.find(c => c.id === f.citationId);
      if (!entry) return null;
      return { citation: entry.citation, relevanceNote: f.relevanceNote, tier: 'stub-placeholder' };
    })
    .filter(Boolean);

  const result = {
    status: selection.noMatch || findings.length === 0 ? 'no_relevant_authority' : 'ok',
    findings,
    stubNotice: STUB_NOTICE
  };

  await supabase.from('cases').update({ research: result, updated_at: new Date().toISOString() }).eq('id', caseId);
  await logAudit(supabase, caseId, 'Research', result.status === 'ok'
    ? `Found ${findings.length} relevant stub-corpus entr${findings.length === 1 ? 'y' : 'ies'}.`
    : 'No relevant authority found in stub corpus.');

  return Response.json(result);
}
