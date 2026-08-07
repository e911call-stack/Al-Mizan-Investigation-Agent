// Cohere — embed-multilingual-v3.0, 1024-dim. Free-tier API key from
// https://dashboard.cohere.com (set COHERE_API_KEY).
export async function embedCohere(text) {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    throw new Error('COHERE_API_KEY is not configured (needed when EMBED_PROVIDER=cohere).');
  }

  const res = await fetch('https://api.cohere.com/v2/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'embed-multilingual-v3.0',
      inputs: [text],
      input_type: 'search_document'
    })
  });

  if (!res.ok) throw new Error('Cohere embedding call failed: ' + (await res.text()).slice(0, 500));
  const data = await res.json();
  const vec = data?.embeddings?.[0];
  if (!vec) throw new Error('Cohere embedding call returned no vector.');
  return vec;
}