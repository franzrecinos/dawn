/**
 * Levenshtein distance between source and target domain (handle portions).
 * If the handles are 0-2 edits apart we surface a warning — typo guard for
 * "nomeo-prod" vs "nomeo-pord". Identical handles return distance 0 (same
 * store written to itself, which is a different bug).
 */

function distance(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function handle(domain) {
  return domain.replace(/\.myshopify\.com$/, '');
}

export function checkDomainSimilarity(sourceDomain, targetDomain) {
  if (sourceDomain === targetDomain) {
    return { ok: false, reason: 'Source and target are the same store.' };
  }
  const d = distance(handle(sourceDomain), handle(targetDomain));
  if (d > 0 && d <= 2) {
    return {
      ok: true,
      warn: `Source and target domains differ by only ${d} character${d === 1 ? '' : 's'} (${sourceDomain} vs ${targetDomain}). Double-check this isn't a typo.`,
    };
  }
  return { ok: true };
}
