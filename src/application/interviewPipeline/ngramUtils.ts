/** N-gram fingerprinting and cosine similarity for text comparison. */

export type NGramVector = Map<string, number>;

/**
 * Build a character n-gram fingerprint for a text.
 * Lowercases, normalizes whitespace, slides window of n chars, counts each n-gram.
 */
export function ngramFingerprint(text: string, n = 3): NGramVector {
  const vec = new Map<string, number>();
  const cleaned = text.toLowerCase().replace(/\s+/g, " ");
  for (let i = 0; i <= cleaned.length - n; i++) {
    const gram = cleaned.slice(i, i + n);
    vec.set(gram, (vec.get(gram) ?? 0) + 1);
  }
  return vec;
}

/** Cosine similarity between two n-gram vectors. */
export function cosineSimilarity(a: NGramVector, b: NGramVector): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, valA] of a) {
    const valB = b.get(key) ?? 0;
    dot += valA * valB;
    normA += valA * valA;
  }
  for (const val of b.values()) {
    normB += val * val;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
