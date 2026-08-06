// Voyage AI is Anthropic's recommended embeddings partner and its
// multilingual model has real Arabic support — needed for the corpus,
// since embedding Arabic legal text through an English-only model would
// give poor retrieval quality. Requires VOYAGE_API_KEY.
export async function embedText(text) {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY is not configured. Add it in Vercel -> Project -> Settings -> Environment Variables, then redeploy.');
  }

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      input: text,
      model: 'voyage-multilingual-2'
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Voyage embedding call failed: ' + errText.slice(0, 500));
  }

  const data = await res.json();
  return data.data[0].embedding;
}
