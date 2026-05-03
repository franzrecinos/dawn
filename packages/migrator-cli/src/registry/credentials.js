import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Per-machine credential store. Indexed by store domain so multiple projects
 * on the same machine share tokens for the same Shopify store. Stored at
 * ~/.config/nomeo-migrator/credentials.json with 0600 perms.
 *
 * Schema:
 *   { stores: { "<domain>": { accessToken: "shpat_..." | "shpca_..." } } }
 */

function credentialsPath() {
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'nomeo-migrator', 'credentials.json');
}

async function readStore() {
  const file = credentialsPath();
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { stores: {} };
    throw err;
  }
}

async function writeStore(data) {
  const file = credentialsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await fs.chmod(file, 0o600);
}

export async function getAccessToken(domain) {
  if (process.env[`SHOPIFY_TOKEN_${envKey(domain)}`]) {
    return process.env[`SHOPIFY_TOKEN_${envKey(domain)}`];
  }
  const store = await readStore();
  return store.stores[domain]?.accessToken ?? null;
}

export async function setAccessToken(domain, accessToken) {
  const store = await readStore();
  store.stores[domain] ??= {};
  store.stores[domain].accessToken = accessToken;
  await writeStore(store);
}

export async function removeAccessToken(domain) {
  const store = await readStore();
  delete store.stores[domain];
  await writeStore(store);
}

export async function listStoredDomains() {
  const store = await readStore();
  return Object.keys(store.stores);
}

function envKey(domain) {
  return domain.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
}

export const credentialsLocation = credentialsPath;
