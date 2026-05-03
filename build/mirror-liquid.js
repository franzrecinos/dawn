import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';

const SRC = path.resolve('src');
const ROOT = path.resolve('.');

const FLAT_DIRS = new Set(['layout', 'templates', 'config', 'locales']);
const NESTED_DIRS = new Set(['sections', 'snippets']);

/**
 * For files inside src/{sections,snippets}/<name>/<name>.{liquid,json},
 * Shopify expects them flat at <topDir>/<name>.<ext>.
 * For files inside src/{layout,templates,config,locales}/**, Shopify
 * expects an exact mirror of the path (e.g. src/templates/customers/login.json
 * -> templates/customers/login.json).
 */
function destFor(srcAbs) {
  const rel = path.relative(SRC, srcAbs);
  const parts = rel.split(path.sep);
  const topDir = parts[0];

  if (NESTED_DIRS.has(topDir)) {
    // src/sections/foo/foo.liquid -> sections/foo.liquid
    // src/sections/header-group.json -> sections/header-group.json (group files at root)
    if (parts.length === 3) return path.join(ROOT, topDir, parts[2]);
    if (parts.length === 2) return path.join(ROOT, topDir, parts[1]);
  }
  if (FLAT_DIRS.has(topDir)) {
    return path.join(ROOT, rel);
  }
  return null;
}

async function copy(srcAbs) {
  const dest = destFor(srcAbs);
  if (!dest) return;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(srcAbs, dest);
}

async function remove(srcAbs) {
  const dest = destFor(srcAbs);
  if (!dest) return;
  await fs.rm(dest, { force: true });
}

export function mirrorLiquid() {
  return {
    name: 'nomeo:mirror-liquid',
    async buildStart() {
      const files = await fg('src/**/*.{liquid,json}', { absolute: true });
      await Promise.all(files.map(copy));
    },
    configureServer(server) {
      const handler = (file) => {
        if (file.startsWith(SRC) && /\.(liquid|json)$/.test(file)) {
          copy(file).catch((err) => server.config.logger.error(String(err)));
        }
      };
      server.watcher.add(path.join(SRC, '**/*.{liquid,json}'));
      server.watcher.on('add', handler);
      server.watcher.on('change', handler);
      server.watcher.on('unlink', (file) => {
        if (file.startsWith(SRC) && /\.(liquid|json)$/.test(file)) {
          remove(file).catch(() => {});
        }
      });
    },
    async watchChange(id, change) {
      if (!id.startsWith(SRC) || !/\.(liquid|json)$/.test(id)) return;
      if (change.event === 'delete') await remove(id);
      else await copy(id);
    },
  };
}
