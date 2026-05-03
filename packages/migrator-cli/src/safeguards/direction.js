/**
 * Role-based direction matrix.
 *
 * Read-down (production -> dev) is always safe. Write-up needs care.
 * Production writes always pass through production-gate.js for the live
 * passwordEnabled + typed-confirmation check; this module only decides whether
 * the direction is *eligible* in principle.
 */

const ALLOWED = {
  // source -> set of valid targets
  development: new Set(['development', 'staging', 'production']),
  staging: new Set(['development', 'staging', 'production']),
  production: new Set(['development', 'staging']),
};

export function checkDirection({ source, target }) {
  if (!ALLOWED[source.role]?.has(target.role)) {
    return {
      ok: false,
      reason: `Direction ${source.role} -> ${target.role} is not allowed (production cannot be written from production self).`,
    };
  }

  // Cross-owner writes need explicit opt-in on BOTH stores. A token leak in
  // one project shouldn't reach the other party's store.
  const crossOwner = source.owner && target.owner && source.owner !== target.owner;
  if (crossOwner) {
    if (!source.crossOwner || !target.crossOwner) {
      return {
        ok: false,
        reason: `Cross-owner direction (${source.owner} -> ${target.owner}) requires "crossOwner": true on both store entries in migrator.config.json.`,
      };
    }
  }

  return { ok: true };
}
