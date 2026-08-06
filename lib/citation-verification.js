import { callClaudeTool } from './claude';
import { STUB_CORPUS } from './stub-data';

const VERIFY_TOOL = {
  name: 'verify_citations',
  description: 'Independently verify each claimed citation against the actual corpus entries provided.',
  input_schema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            citation: { type: 'string' },
            verified: { type: 'boolean' },
            reason: { type: 'string' }
          },
          required: ['citation', 'verified', 'reason']
        }
      }
    },
    required: ['results']
  }
};

function systemPrompt(corpusListText) {
  return `You are the Citation Verification Agent. You are an INDEPENDENT check — you do not trust that a citation is valid just because another agent produced it. Verify each claimed citation against the actual corpus list below.

Corpus entries that actually exist:
${corpusListText}

Always respond by calling the verify_citations tool.`;
}

// findings come from Research's output; corpusSource tells us whether to
// check them against the real ingested corpus or the stub set. supabase
// is only needed for the real-corpus path (a lookup by citation).
export async function runCitationVerification(findings, corpusSource, supabase, jurisdiction) {
  if (!findings || findings.length === 0) {
    return { status: 'nothing_to_verify', results: [], allPassed: true };
  }

  let corpusListText;
  if (corpusSource === 'legal_corpus' && supabase) {
    const citations = findings.map(f => f.citation);
    const { data: rows } = await supabase
      .from('legal_corpus')
      .select('citation, text_ar')
      .eq('jurisdiction', jurisdiction)
      .in('citation', citations);
    corpusListText = (rows || []).map(r => `- ${r.citation} | ${r.text_ar.slice(0, 300)}`).join('\n');
    if (!corpusListText) {
      // Claimed citations that no longer resolve to real rows — treat as
      // a hard fail rather than silently passing.
      return {
        status: 'fail',
        allPassed: false,
        results: findings.map(f => ({ citation: f.citation, verified: false, reason: 'Citation not found in the real corpus at verification time.' }))
      };
    }
  } else {
    corpusListText = STUB_CORPUS.map(c => `- ${c.citation} | ${c.summary}`).join('\n');
  }

  const claimsText = findings.map((f, i) => `${i + 1}. Citation: "${f.citation}" | Claimed relevance: "${f.relevanceNote}"`).join('\n');

  const selection = await callClaudeTool({
    system: systemPrompt(corpusListText),
    userContent: `Claimed citations to verify:\n${claimsText}`,
    tool: VERIFY_TOOL
  });

  const results = selection.results || [];
  const allPassed = results.length > 0 && results.every(r => r.verified === true);
  return { status: allPassed ? 'pass' : 'fail', results, allPassed };
}
