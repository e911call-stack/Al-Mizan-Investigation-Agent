// Google Gemini "forced tool call" adapter, mirroring the interface of
// lib/claude.js's callClaudeTool so the two are interchangeable. Gemini's
// function calling is forced via toolConfig.functionCallingConfig with
// mode ANY and an allow-list containing exactly the one tool we want called.
// Uses the free-tier model family by default; override with GEMINI_MODEL.

export async function callGeminiTool({ system, userContent, tool, maxTokens = 1200 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in Vercel -> Project -> Settings -> Environment Variables.');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      tools: [
        {
          functionDeclarations: [
            {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema
            }
          ]
        }
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: [tool.name]
        }
      },
      generationConfig: { maxOutputTokens: maxTokens }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    const err = new Error('Gemini API call failed: ' + errText.slice(0, 500));
    err.status = 502;
    throw err;
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const fnCall = parts.find(p => p && p.functionCall && p.functionCall.name === tool.name);
  if (!fnCall || !fnCall.functionCall.args) {
    const err = new Error('Agent did not return the expected tool call.');
    err.status = 502;
    throw err;
  }
  return fnCall.functionCall.args;
}