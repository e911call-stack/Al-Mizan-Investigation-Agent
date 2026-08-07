// Embedding adapters. Each returns an array of 1024 floats (the exact dimension
// of the PG location legal_corpus.embedding column), so switching providers needs
// no schema migration.

// Voyage AI — voyage-multilingual-2, 1024-dim, strong Arabic support.
export async function embedVoyage(text) {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY is not configured (or set EMBED_PROVIDER to cohere/huggingface).');
  }

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ input: text, model: 'voyage-multilingual-2' })
  });

  if (!res.ok) throw new Error('Voyage embedding call failed: ' + (await res.text()).slice(0, 500));
  const data = await res.json();
  return data.data[0].embedding;
}