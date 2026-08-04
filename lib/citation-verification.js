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

export async function runCitationVerification(findings) {
  if (!findings || findings.length === 0) {
    return { status: 'nothing_to_verify', results: [], allPassed: true };
  }

  const corpusListText = STUB_CORPUS.map(c => `- ${c.citation} | ${c.summary}`).join('\n');
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
