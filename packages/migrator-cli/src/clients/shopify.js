import { createAdminApiClient } from '@shopify/admin-api-client';

/**
 * Wraps the official Admin GraphQL client with:
 *   - rate-limit awareness (X-Shopify-Shop-Api-Call-Limit / cost extensions)
 *   - simple circuit breaker on consecutive 429s
 *   - a thin `fetch` helper for the REST endpoints we still need
 *     (e.g. /admin/api/<v>/shop.json for password_enabled)
 */

const API_VERSION = '2024-10';
const THROTTLE_AT = 0.8; // pause sleeping when we've consumed this share of the bucket
const PAUSE_AT = 0.95;
const CIRCUIT_BREAKER_LIMIT = 3;

export function createShopifyClient({ domain, accessToken }) {
  if (!accessToken) {
    throw new Error(
      `No access token configured for ${domain}. Run \`migrator stores add\` to set one.`
    );
  }

  const inner = createAdminApiClient({
    storeDomain: domain,
    apiVersion: API_VERSION,
    accessToken,
  });

  let consecutive429 = 0;

  async function request(query, variables) {
    const result = await inner.request(query, { variables });

    // Surface user errors loudly. Most Shopify mutations return a
    // userErrors array even when the HTTP call succeeds.
    if (result.errors) {
      const message = result.errors.message || JSON.stringify(result.errors);
      throw new Error(`Shopify API error (${domain}): ${message}`);
    }

    // Cost-based throttling. The extensions block reports the leaky-bucket
    // state; if we're past THROTTLE_AT, sleep a bit; past PAUSE_AT, sleep
    // longer. Keeps long migrations from getting 429-ed.
    const cost = result.extensions?.cost?.throttleStatus;
    if (cost) {
      const ratio = 1 - cost.currentlyAvailable / cost.maximumAvailable;
      if (ratio > PAUSE_AT) {
        await sleep(2000);
      } else if (ratio > THROTTLE_AT) {
        await sleep(500);
      }
    }

    consecutive429 = 0;
    return result;
  }

  async function fetchRest(pathSuffix, init = {}) {
    const url = `https://${domain}/admin/api/${API_VERSION}${pathSuffix}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    });

    if (res.status === 429) {
      consecutive429 += 1;
      if (consecutive429 >= CIRCUIT_BREAKER_LIMIT) {
        throw new Error(
          `Circuit breaker tripped: ${CIRCUIT_BREAKER_LIMIT} consecutive 429s from ${domain}. Pausing run.`
        );
      }
      const retryAfter = Number(res.headers.get('retry-after') || '2');
      await sleep(retryAfter * 1000);
    } else {
      consecutive429 = 0;
    }

    return res;
  }

  return {
    domain,
    apiVersion: API_VERSION,
    request,
    fetch: fetchRest,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
