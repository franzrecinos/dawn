import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Pre-write snapshot of the target's current state. If the user later regrets
 * the run, this is the rollback path. Snapshot is verified (re-read + entity
 * count match) before the actual write proceeds — no snapshot, no write.
 *
 * Snapshot location: <projectRoot>/.migrator/snapshots/<ts>-<storeHandle>-<entity>.json
 * Gitignored by default (the .migrator dir is added to .gitignore in `init`).
 */
export async function snapshot({ projectRoot, store, entity, data }) {
  const dir = path.join(projectRoot, '.migrator', 'snapshots');
  await fs.mkdir(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const handle = store.domain.replace(/\.myshopify\.com$/, '');
  const file = path.join(dir, `${ts}-${handle}-${entity}.json`);

  const payload = {
    ts: new Date().toISOString(),
    store: store.domain,
    entity,
    count: Array.isArray(data) ? data.length : 1,
    data,
  };

  await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');

  // Verify-on-write: read it back and confirm count matches. Cheap insurance
  // against a partial write (e.g. disk-full mid-flush).
  const reread = JSON.parse(await fs.readFile(file, 'utf8'));
  if (reread.count !== payload.count) {
    throw new Error(`Snapshot verification failed for ${file} — counts diverged.`);
  }

  return { path: file, count: payload.count };
}
