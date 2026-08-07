// Unified "call the agent's tool" boundary. Every agent route (Intake, Research
// selection, Citation Verification, Fact-Consistency, corpus splitting) goes
// through this so the LLM provider can be swapped without touching business
// logic. Set LLM_PROVIDER to 'anthropic' or 'gemini' (defaults to anthropic).
import { callClaudeTool } from './claude';
import { callGeminiTool } from './gemini';

export const LLM_PROVIDER = process.env.LLM_PROVIDER || 'anthropic';

export async function callAgentTool({ system, userContent, tool, model, maxTokens = 1200 }) {
  if (LLM_PROVIDER === 'gemini') {
    return callGeminiTool({ system, userContent, tool, maxTokens });
  }
  return callClaudeTool({ system, userContent, tool, model, maxTokens });
}