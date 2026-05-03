import crypto from 'node:crypto';

/**
 * Stable content hash for idempotency. JSON.stringify with deterministic key
 * ordering — re-runs against an unchanged source produce the same hash, and
 * the diff engine can mark "no change" entities as skip.
 */
export function contentHash(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}
