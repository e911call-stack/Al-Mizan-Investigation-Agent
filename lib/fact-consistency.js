import { callClaudeTool } from './claude';

const CHECK_TOOL = {
  name: 'check_fact_consistency',
  description: 'Classify each fact by tier and flag anything that looks inconsistent or unsupported.',
  input_schema: {
    type: 'object',
    properties: {
      tier1Issues: { type: 'array', items: { type: 'string' } },
      tier3Note: { type: 'string' }
    },
    required: ['tier1Issues', 'tier3Note']
  }
};

const SYSTEM_PROMPT = `You are the Fact-Consistency Agent. Tier 1 (hard facts: names, dates, amounts) issues are BLOCKING — flag anything inconsistent or missing a source anchor. Tier 3 (legal characterization) is never blocking — always note it plainly rather than judging it.

Always respond by calling the check_fact_consistency tool.`;

export async function runFactConsistency(extracted) {
  if (!extracted || (!extracted.parties && !extracted.keyDates)) {
    return { status: 'nothing_to_check', tier1Issues: [], tier3Note: '', allPassed: true };
  }

  const factsText = JSON.stringify({
    parties: extracted.parties || [],
    claimType: extracted.claimType || '',
    claimValueEstimate: extracted.claimValueEstimate,
    claimValueCurrency: extracted.claimValueCurrency || '',
    keyDates: extracted.keyDates || []
  }, null, 2);

  const checked = await callClaudeTool({
    system: SYSTEM_PROMPT,
    userContent: `Extracted case facts to check:\n${factsText}`,
    tool: CHECK_TOOL,
    maxTokens: 800
  });

  const tier1Issues = checked.tier1Issues || [];
  const allPassed = tier1Issues.length === 0;
  return { status: allPassed ? 'pass' : 'fail', tier1Issues, tier3Note: checked.tier3Note || '', allPassed };
}
