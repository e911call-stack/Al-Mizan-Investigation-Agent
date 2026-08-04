// Shared by every agent that calls Claude with forced tool-use for
// reliable structured output, rather than parsing free text as JSON.
export async function callClaudeTool({ system, userContent, tool, maxTokens = 1200 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not configured. Add it in Vercel -> Project -> Settings -> Environment Variables, then redeploy.'
    );
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }],
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    const err = new Error('Claude API call failed: ' + errText.slice(0, 500));
    err.status = 502;
    throw err;
  }

  const data = await res.json();
  const toolUse = (data.content || []).find(block => block.type === 'tool_use');
  if (!toolUse) {
    const err = new Error('Agent did not return structured output.');
    err.status = 502;
    throw err;
  }
  return toolUse.input;
}
