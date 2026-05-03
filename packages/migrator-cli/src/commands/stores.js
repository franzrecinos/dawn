import { p, bail } from '../ui/prompts.js';
import { log, pc } from '../ui/log.js';
import { loadConfig, resolveStore } from '../registry/config.js';
import {
  setAccessToken,
  removeAccessToken,
  getAccessToken,
  credentialsLocation,
} from '../registry/credentials.js';
import { createShopifyClient } from '../clients/shopify.js';

export async function add(alias) {
  const config = await loadConfig();
  const aliases = Object.keys(config.stores);
  if (!aliases.length) bail('No stores in migrator.config.json. Run `migrator init` first.');

  let chosen = alias;
  if (!chosen) {
    const sel = await p.select({
      message: 'Which store?',
      options: aliases.map((a) => ({
        value: a,
        label: a,
        hint: `${config.stores[a].domain} · ${config.stores[a].role}`,
      })),
    });
    if (p.isCancel(sel)) bail('Cancelled.');
    chosen = sel;
  }

  const store = resolveStore(config, chosen);

  const token = await p.password({
    message: `Access token for ${store.domain}`,
    validate: (v) =>
      v && (v.startsWith('shpat_') || v.startsWith('shpca_'))
        ? undefined
        : 'Expected token starting with shpat_ or shpca_.',
  });
  if (p.isCancel(token)) bail('Cancelled.');

  // Verify the token works *and* check scope hygiene before persisting.
  const client = createShopifyClient({ domain: store.domain, accessToken: token });
  log.info('Verifying token against Shopify...');
  let shopName;
  try {
    const { data } = await client.request(`query { shop { name myshopifyDomain } }`, {});
    if (!data?.shop) throw new Error('Empty shop response.');
    if (data.shop.myshopifyDomain !== store.domain) {
      bail(
        `Token belongs to ${data.shop.myshopifyDomain}, not ${store.domain}. Refusing to store.`
      );
    }
    shopName = data.shop.name;
  } catch (err) {
    bail(`Token verification failed: ${err.message}`);
  }

  // Best-effort scope check (REST). If it fails we don't block — some Custom
  // App tokens can't read this endpoint.
  try {
    const res = await client.fetch('/oauth/access_scopes.json');
    if (res.ok) {
      const json = await res.json();
      const scopes = (json.access_scopes || []).map((s) => s.handle);
      const writeScopes = scopes.filter((s) => s.startsWith('write_'));
      if (store.role === 'production' && writeScopes.length) {
        log.warn(
          `This is a PRODUCTION store and the token has write scopes: ${writeScopes.join(', ')}.`
        );
        log.warn('Consider issuing a read-only token for routine use.');
      }
    }
  } catch {
    /* ignore */
  }

  await setAccessToken(store.domain, token);
  log.ok(`Stored token for ${store.domain} (${shopName}).`);
  log.dim(`Credentials file: ${credentialsLocation()}`);
}

export async function list() {
  const config = await loadConfig();
  const aliases = Object.keys(config.stores);
  if (!aliases.length) {
    log.warn('No stores configured. Run `migrator init`.');
    return;
  }

  const rows = await Promise.all(
    aliases.map(async (a) => {
      const s = config.stores[a];
      const hasToken = Boolean(await getAccessToken(s.domain));
      return { alias: a, ...s, hasToken };
    })
  );

  for (const r of rows) {
    const role =
      r.role === 'production'
        ? pc.red(r.role)
        : r.role === 'staging'
          ? pc.yellow(r.role)
          : pc.green(r.role);
    const cred = r.hasToken ? pc.green('token') : pc.dim('no token');
    const owner = r.owner === 'client' ? pc.magenta('client') : pc.dim('us');
    console.log(`  ${pc.bold(r.alias.padEnd(12))}  ${r.domain.padEnd(36)}  ${role}  ${owner}  ${cred}`);
  }
}

export async function remove(alias) {
  const config = await loadConfig();
  const store = resolveStore(config, alias);
  await removeAccessToken(store.domain);
  log.ok(`Removed token for ${store.domain} from local credential store.`);
  log.dim('(The store entry remains in migrator.config.json — edit it manually if you want to drop it.)');
}
