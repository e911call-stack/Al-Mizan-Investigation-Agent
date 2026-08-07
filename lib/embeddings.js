// Embedding provider dispatcher. All supported adapters return a numeric vector
// consistent with the legal_corpus.embedding column, which is vector(1024).
//   - 'voyage'       (default)  voyage-multilingual-2, Vega 1024-dim. Needs VOYAGE_API_KEY.
//   - 'cohere'       embed-multilingual-v3.0, 1024-dim. Needs COHERE_API_KEY.
//   - 'huggingface'  BAAI/bge-m3, 1024-dim, multilingual. Needs HUGGINGFACE_API_KEY.
// Set EMBED_PROVIDER to choose; the missing key only throws when that provider is actually used.

import { embedVoyage } from './embeddings/voyage';
import { embedCohere } from './embeddings/cohere';
import { embedHuggingFace } from './embeddings/huggingface';

const EMBED_PROVIDER = process.env.EMBED_PROVIDER || 'voyage';

export async function embedText(text) {
  switch (EMBED_PROVIDER) {
    case 'cohere':
      return embedCohere(text);
    case 'huggingface':
      return embedHuggingFace(text);
    case 'voyage':
    default:
      return embedVoyage(text);
  }
}