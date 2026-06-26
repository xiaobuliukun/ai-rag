const VECTOR_SIZE = 96;

export function buildLocalEmbedding(text: string): number[] {
  const vector = new Array<number>(VECTOR_SIZE).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    const hash = hashString(token);
    const index = Math.abs(hash) % VECTOR_SIZE;
    vector[index] += hash % 2 === 0 ? 1 : -1;
  }

  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );

  if (!magnitude) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

export function serializeEmbedding(vector: number[]): string {
  return JSON.stringify(vector.map((value) => Number(value.toFixed(6))));
}

export function parseEmbedding(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => (typeof item === 'number' ? item : 0))
      : [];
  } catch {
    return [];
  }
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let score = 0;

  for (let index = 0; index < length; index += 1) {
    score += left[index] * right[index];
  }

  return score;
}

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const latin = Array.from(
    normalized.matchAll(/[a-z0-9][a-z0-9_-]{1,}/g),
    (match) => match[0],
  );
  const cjk = Array.from(
    normalized.matchAll(/[\u4e00-\u9fff]/g),
    (match) => match[0],
  );
  const pairs: string[] = latin.flatMap((token) => {
    if (token.length < 4) {
      return [token];
    }

    const grams: string[] = [token];
    for (let index = 0; index < token.length - 2; index += 1) {
      grams.push(token.slice(index, index + 3));
    }
    return grams;
  });

  return [...pairs, ...cjk];
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}
