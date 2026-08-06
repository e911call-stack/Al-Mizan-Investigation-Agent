import { getSupabase, logAudit } from '../../../../lib/supabase';
import { callClaudeTool } from '../../../../lib/claude';
import { embedText } from '../../../../lib/embeddings';
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

function stubSystemPrompt(corpusListText) {
  return `You are the Research Agent in a legal case-investigation pipeline. You may ONLY select citationId values from the list below — never invent one. If nothing is relevant, set noMatch true and return an empty findings array.

Corpus entries available:
${corpusListText}

Always respond by calling the select_relevant_authority tool.`;
}

async function tryRealCorpus(supabase, jurisdictionSignal, claimType) {
  let embedding;
  try {
    embedding = await embedText(claimType || jurisdictionSignal);
  } catch (e) {
    // VOYAGE_API_KEY missing or the call failed — fall back to stub rather
    // than blocking Research entirely.
    return null;
  }

  const { data: matches, error } = await supabase.rpc('match_legal_corpus', {
    query_embedding: embedding,
    match_jurisdiction: jurisdictionSignal,
    match_count: 5
  });

  if (error || !matches || matches.length === 0) return null;

  // A weak semantic match is worse than no match — only trust results
  // above a real similarity floor, otherwise fall through to the stub.
  const strong = matches.filter(m => m.similarity > 0.5);
  if (strong.length === 0) return null;

  return {
    status: 'ok',
    corpusSource: 'legal_corpus',
    findings: strong.map(m => ({
      citation: m.citation,
      relevanceNote: `Semantic match (similarity ${m.similarity.toFixed(2)}) against ingested corpus text.`,
      tier: m.tier
    }))
  };
}

async function stubCorpusFallback(jurisdictionSignal, claimType) {
  const relevantCorpus = STUB_CORPUS.filter(c => jurisdictionSignal.startsWith('jordan') && c.jurisdiction === 'jordan-civil');
  if (relevantCorpus.length === 0) {
    return {
      status: 'no_corpus_for_jurisdiction',
      corpusSource: 'none',
      findings: [],
      stubNotice: STUB_NOTICE,
      message: `No corpus (real or stub) available yet for jurisdiction "${jurisdictionSignal || 'unspecified'}".`
    };
  }

  const corpusListText = relevantCorpus.map(c => `- id: ${c.id} | ${c.citation} | ${c.summary}`).join('\n');
  const selection = await callClaudeTool({
    system: stubSystemPrompt(corpusListText),
    userContent: `Claim type: ${claimType}\nJurisdiction: ${jurisdictionSignal}`,
    tool: SELECT_TOOL
  });

  const findings = (selection.findings || [])
    .map(f => {
      const entry = relevantCorpus.find(c => c.id === f.citationId);
      if (!entry) return null;
      return { citation: entry.citation, relevanceNote: f.relevanceNote, tier: 'stub-placeholder' };
    })
    .filter(Boolean);

  return {
    status: selection.noMatch || findings.length === 0 ? 'no_relevant_authority' : 'ok',
    corpusSource: 'stub',
    findings,
    stubNotice: STUB_NOTICE
  };
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
  const claimType = caseRow.claim_type;

  // Real corpus first, stub corpus only as a fallback for coverage gaps.
  let result = await tryRealCorpus(supabase, jurisdictionSignal, claimType);
  if (!result) {
    try {
      result = await stubCorpusFallback(jurisdictionSignal, claimType);
    } catch (e) {
      return Response.json({ error: e.message }, { status: e.status || 500 });
    }
  }

  await supabase.from('cases').update({ research: result, updated_at: new Date().toISOString() }).eq('id', caseId);
  await logAudit(supabase, caseId, 'Research', result.status === 'ok'
    ? `Found ${result.findings.length} finding(s) from ${result.corpusSource === 'legal_corpus' ? 'real ingested corpus' : 'stub corpus'}.`
    : (result.message || 'No relevant authority found.'));

  return Response.json(result);
}
