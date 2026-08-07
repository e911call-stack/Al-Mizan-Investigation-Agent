// Hugging Face Inference — BAAI/bge-m3, 1024-dim, multilingual (including
// Arabic). Free: grab a token from https://huggingface.co/settings/tokens
// and set HUGGINGFACE_API_KEY. This uses the hosted Inference API, so no GPU needed.
export async function embedHuggingFace(text) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    throw new Error('HUGGINGFACE_API_KEY is not configured (needed when EMBED_PROVIDER=huggingface).');
  }

  const res = await fetch('https://api-inference.huggingface.co/pipeline/feature-extraction/BAAI/bge-m3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ inputs: text })
  });

  if (!res.ok) throw new Error('Hugging Face embedding call failed: ' + (await res.text()).slice(0, 500));
  const data = await res.json();
  // bge-m3 returns a single nested float array for one input.
  const vec = Array.isArray(data[0]) ? data[0] : data;
  if (!Array.isArray(vec)) throw new Error('Hugging Face embedding call returned an unexpected shape.');
  return vec;
}