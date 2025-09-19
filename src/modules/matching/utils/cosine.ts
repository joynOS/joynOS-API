export function cosineSim(a: Float32Array, b: Float32Array) {
  let dot = 0,
    na = 0,
    nb = 0;
  const n = Math.min(a.length, b.length);

  // Check if either array is all zeros
  const aHasData = Array.from(a).some(val => val !== 0);
  const bHasData = Array.from(b).some(val => val !== 0);

  // If either embedding is all zeros, return 0
  if (!aHasData || !bHasData) {
    return 0;
  }

  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}
