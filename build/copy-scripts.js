import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';

const SRC = path.resolve('src/scripts');
const DEST = path.resolve('assets');

/**
 * Copies src/scripts/*.js to assets/ verbatim. These files are loaded as
 * plain <script defer> tags and define globals (e.g. PUB_SUB_EVENTS,
 * SectionId). Routing them through Rollup bundles them as ESM and the
 * unused-export tree-shaker drops the lot.
 */
async function copyOne(file) {
  const dest = path.join(DEST, path.basename(file));
  await fs.mkdir(DEST, { recursive: true });
  await fs.copyFile(file, dest);
}

async function copyAll() {
  const files = await fg('src/scripts/*.js', { absolute: true });
  await Promise.all(files.map(copyOne));
}

export function copyScripts() {
  return {
    name: 'nomeo:copy-scripts',
    async buildStart() {
      await copyAll();
    },
    configureServer(server) {
      server.watcher.add(path.join(SRC, '*.js'));
      const handler = (file) => {
        if (file.startsWith(SRC) && file.endsWith('.js')) {
          copyOne(file).catch((err) => server.config.logger.error(String(err)));
        }
      };
      server.watcher.on('add', handler);
      server.watcher.on('change', handler);
    },
    async watchChange(id, change) {
      if (id.startsWith(SRC) && id.endsWith('.js') && change.event !== 'delete') {
        await copyOne(id);
      }
    },
  };
}
