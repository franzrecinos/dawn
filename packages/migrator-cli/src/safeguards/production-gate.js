import { typedConfirmation, p } from '../ui/prompts.js';
import { audit } from '../registry/audit.js';

/**
 * The production write gate.
 *
 * Allowed to proceed only if ALL of:
 *   1. target.role === 'production' (this gate is invoked only then)
 *   2. shop.passwordEnabled === true (queried live, never trusted from cache)
 *   3. invoker passed --allow-production
 *   4. operator types the *.myshopify.com domain to confirm
 *
 * The password check is intentionally a live API call on every run. The
 * moment a merchant flips password protection off (i.e., goes live), the
 * gate denies regardless of stale local state.
 */
export async function productionGate({ target, client, allowProduction, isTTY }) {
  if (target.role !== 'production') return { ok: true };

  if (!allowProduction) {
    await audit({
      action: 'production-gate',
      outcome: 'denied',
      reason: 'missing --allow-production flag',
      target: target.domain,
    });
    return {
      ok: false,
      reason: 'Target is production. Pass --allow-production to even attempt this.',
    };
  }

  if (!isTTY) {
    await audit({
      action: 'production-gate',
      outcome: 'denied',
      reason: 'no TTY',
      target: target.domain,
    });
    return {
      ok: false,
      reason: 'Production writes require an interactive TTY. --yes is rejected for production.',
    };
  }

  // Live password-protection check.
  const passwordEnabled = await fetchPasswordEnabled(client);
  if (passwordEnabled === null) {
    await audit({
      action: 'production-gate',
      outcome: 'denied',
      reason: 'could not determine passwordEnabled',
      target: target.domain,
    });
    return {
      ok: false,
      reason:
        'Could not determine whether the production store has password protection enabled. Refusing to proceed.',
    };
  }
  if (!passwordEnabled) {
    await audit({
      action: 'production-gate',
      outcome: 'denied',
      reason: 'passwordEnabled=false (store appears to be live)',
      target: target.domain,
    });
    return {
      ok: false,
      reason: `${target.domain} appears to be public (password protection is OFF). Refusing to write to a live store.`,
    };
  }

  p.note(
    `You are about to write to a PRODUCTION store: ${target.domain}\n` +
      `Password protection is currently ON, so the store is in preview mode.\n` +
      `If you flip the storefront password off mid-deploy, the next run will be denied.`,
    'Production gate'
  );

  const matched = await typedConfirmation(
    `Type the production domain to confirm`,
    target.domain
  );
  if (!matched) {
    await audit({
      action: 'production-gate',
      outcome: 'denied',
      reason: 'typed confirmation failed or cancelled',
      target: target.domain,
    });
    return { ok: false, reason: 'Confirmation cancelled.' };
  }

  await audit({
    action: 'production-gate',
    outcome: 'passed',
    target: target.domain,
  });
  return { ok: true };
}

/**
 * Detect storefront password protection. Two-track because Shopify's API
 * surface for this varies:
 *   - REST: GET /admin/api/2024-10/shop.json -> { shop: { password_enabled } }
 *   - GraphQL: shop { ... } may or may not expose this depending on version
 * We try GraphQL first and fall back to REST. Returns null if neither answers.
 */
async function fetchPasswordEnabled(client) {
  try {
    const { data } = await client.request(
      `query { shop { id name myshopifyDomain } }`,
      {}
    );
    if (!data?.shop) return null;
  } catch {
    return null;
  }

  // REST fallback for password_enabled — the field reliably exists there.
  try {
    const res = await client.fetch(`/shop.json`, { method: 'GET' });
    if (!res.ok) return null;
    const json = await res.json();
    if (typeof json?.shop?.password_enabled === 'boolean') {
      return json.shop.password_enabled;
    }
    return null;
  } catch {
    return null;
  }
}
