import fs from 'node:fs/promises';
import path from 'node:path';
import { p, bail } from '../ui/prompts.js';
import { log } from '../ui/log.js';
import { findConfigPath, saveConfig } from '../registry/config.js';

/**
 * `migrator init` — interactive scaffolding of migrator.config.json at the
 * cwd. Refuses to overwrite an existing config; tell the user to edit it
 * directly instead. Does NOT collect access tokens — those go through
 * `stores add` so we can verify them with the API before storing.
 */
export async function init() {
  const cwd = process.cwd();
  const existing = await findConfigPath(cwd);
  if (existing && path.dirname(existing) === cwd) {
    log.warn(`migrator.config.json already exists at ${existing}. Edit it directly.`);
    return;
  }

  p.intro('migrator init');

  const stores = {};
  let addAnother = true;
  while (addAnother) {
    const alias = await p.text({
      message: 'Store alias (short name used in commands, e.g. dev, staging, prod)',
      validate: (v) => (!v ? 'Required.' : v in stores ? 'Already used.' : undefined),
    });
    if (p.isCancel(alias)) bail('Cancelled.');

    const domain = await p.text({
      message: 'Store domain',
      placeholder: `${alias}.myshopify.com`,
      validate: (v) =>
        v && v.endsWith('.myshopify.com') ? undefined : 'Must end in .myshopify.com',
    });
    if (p.isCancel(domain)) bail('Cancelled.');

    const role = await p.select({
      message: 'Role',
      options: [
        { value: 'development', label: 'development', hint: 'free to write' },
        { value: 'staging', label: 'staging', hint: 'free to write' },
        {
          value: 'production',
          label: 'production',
          hint: 'gated — passwordEnabled + typed confirmation required',
        },
      ],
    });
    if (p.isCancel(role)) bail('Cancelled.');

    const owner = await p.select({
      message: 'Owner',
      options: [
        { value: 'us', label: 'us', hint: 'our store' },
        { value: 'client', label: 'client', hint: 'someone else owns it' },
      ],
    });
    if (p.isCancel(owner)) bail('Cancelled.');

    stores[alias] = {
      domain: domain.trim(),
      role,
      owner,
      ...(owner === 'client' ? { crossOwner: false } : {}),
    };

    const more = await p.confirm({ message: 'Add another store?', initialValue: false });
    if (p.isCancel(more)) bail('Cancelled.');
    addAnother = more;
  }

  const configPath = path.join(cwd, 'migrator.config.json');
  await saveConfig({ version: 1, stores }, configPath);
  log.ok(`Wrote ${configPath}`);

  // Make sure .migrator/ (snapshot dir) is gitignored — added once, never
  // touched again.
  await ensureGitignore(cwd);

  p.note(
    'Next: add an access token for each store with:\n  migrator stores add',
    'You\'re ready'
  );
  p.outro('done');
}

async function ensureGitignore(cwd) {
  const file = path.join(cwd, '.gitignore');
  let contents = '';
  try {
    contents = await fs.readFile(file, 'utf8');
  } catch {
    // no gitignore — we won't create one just for this
    return;
  }
  if (contents.includes('.migrator/')) return;
  const trailing = contents.endsWith('\n') ? '' : '\n';
  await fs.appendFile(file, `${trailing}\n# Migrator CLI snapshots\n.migrator/\n`, 'utf8');
}
