import fs from 'node:fs/promises';
import path from 'node:path';

const VALID_ROLES = new Set(['development', 'staging', 'production']);
const CONFIG_FILENAME = 'migrator.config.json';

export async function findConfigPath(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, CONFIG_FILENAME);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }
}

export async function loadConfig(startDir) {
  const configPath = await findConfigPath(startDir);
  if (!configPath) {
    const err = new Error(
      `No ${CONFIG_FILENAME} found. Run \`migrator init\` from your project root.`
    );
    err.code = 'NO_CONFIG';
    throw err;
  }
  const raw = JSON.parse(await fs.readFile(configPath, 'utf8'));
  validateConfig(raw, configPath);
  return { ...raw, configPath };
}

export function validateConfig(config, configPath) {
  if (config.version !== 1) {
    throw new Error(`${configPath}: unsupported config version ${config.version} (expected 1).`);
  }
  if (!config.stores || typeof config.stores !== 'object') {
    throw new Error(`${configPath}: missing "stores" object.`);
  }
  for (const [alias, store] of Object.entries(config.stores)) {
    if (!store.domain || !store.domain.endsWith('.myshopify.com')) {
      throw new Error(
        `${configPath}: store "${alias}" must have a "domain" ending in .myshopify.com.`
      );
    }
    if (!VALID_ROLES.has(store.role)) {
      throw new Error(
        `${configPath}: store "${alias}" has invalid role "${store.role}". Expected one of: ${[...VALID_ROLES].join(', ')}.`
      );
    }
    if (store.crossOwner !== undefined && typeof store.crossOwner !== 'boolean') {
      throw new Error(`${configPath}: store "${alias}" crossOwner must be boolean if set.`);
    }
  }
}

export async function saveConfig(config, configPath) {
  const { configPath: _drop, ...persistable } = config;
  await fs.writeFile(configPath, JSON.stringify(persistable, null, 2) + '\n', 'utf8');
}

export function resolveStore(config, alias) {
  const store = config.stores[alias];
  if (!store) {
    const known = Object.keys(config.stores).join(', ') || '(none)';
    throw new Error(`Unknown store alias "${alias}". Known: ${known}.`);
  }
  return { alias, ...store };
}
