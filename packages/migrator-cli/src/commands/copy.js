import path from 'node:path';
import { p, bail } from '../ui/prompts.js';
import { log } from '../ui/log.js';
import { renderPlan } from '../ui/diff.js';
import { loadConfig, resolveStore } from '../registry/config.js';
import { getAccessToken } from '../registry/credentials.js';
import { audit } from '../registry/audit.js';
import { createShopifyClient } from '../clients/shopify.js';
import { getEntity } from '../entities/index.js';
import { checkDirection } from '../safeguards/direction.js';
import { checkDomainSimilarity } from '../safeguards/domain-check.js';
import { productionGate } from '../safeguards/production-gate.js';
import { snapshot } from '../safeguards/snapshot.js';

/**
 * `migrator copy <entity> --from <alias> --to <alias>`
 *
 * Default behaviour is dry-run: extract from both sides, diff, render plan,
 * stop. `--apply` flips it into write mode, which adds: production gate,
 * pre-write snapshot of the target, mutation execution, audit log.
 *
 * Reads `--yes` to skip the post-plan confirmation in non-prod environments.
 * --yes is rejected if the target is production (production-gate enforces).
 */
export async function copy(entityName, options = {}) {
  const config = await loadConfig();

  if (!options.from || !options.to) {
    bail('--from <alias> and --to <alias> are required.');
  }

  const source = resolveStore(config, options.from);
  const target = resolveStore(config, options.to);
  const entity = getEntity(entityName);

  // ── Direction matrix ────────────────────────────────────────────────────
  const direction = checkDirection({ source, target });
  if (!direction.ok) {
    await audit({
      action: 'copy',
      outcome: 'denied',
      reason: direction.reason,
      entity: entity.id,
      source: source.domain,
      target: target.domain,
    });
    bail(direction.reason);
  }

  // ── Domain similarity ───────────────────────────────────────────────────
  const sim = checkDomainSimilarity(source.domain, target.domain);
  if (!sim.ok) bail(sim.reason);
  if (sim.warn) log.warn(sim.warn);

  // ── Build clients ───────────────────────────────────────────────────────
  const sourceToken = await getAccessToken(source.domain);
  const targetToken = await getAccessToken(target.domain);
  if (!sourceToken) bail(`No access token for ${source.domain}. Run \`migrator stores add\`.`);
  if (!targetToken) bail(`No access token for ${target.domain}. Run \`migrator stores add\`.`);

  const sourceClient = createShopifyClient({ domain: source.domain, accessToken: sourceToken });
  const targetClient = createShopifyClient({ domain: target.domain, accessToken: targetToken });

  // ── Extract & diff ──────────────────────────────────────────────────────
  log.info(`Extracting ${entity.label} from ${source.domain}...`);
  const sourceData = await entity.extract(sourceClient);
  log.info(`  ${sourceData.length} item(s) on source.`);

  log.info(`Extracting ${entity.label} from ${target.domain}...`);
  const targetData = await entity.extract(targetClient);
  log.info(`  ${targetData.length} item(s) on target.`);

  const plan = entity.planDiff({ source: sourceData, target: targetData });

  log.raw(`\n  Plan: ${entity.label}  ${source.domain}  →  ${target.domain}`);
  renderPlan(plan);

  const totalChanges = plan.create.length + plan.update.length + (plan.destroy?.length || 0);
  if (totalChanges === 0) {
    await audit({
      action: 'copy',
      outcome: 'no-op',
      entity: entity.id,
      source: source.domain,
      target: target.domain,
    });
    log.ok('Nothing to do.');
    return;
  }

  if (!options.apply) {
    log.dim('\n  Dry-run only. Pass --apply to write changes.');
    await audit({
      action: 'copy',
      outcome: 'dry-run',
      entity: entity.id,
      source: source.domain,
      target: target.domain,
      plan: { create: plan.create.length, update: plan.update.length, skip: plan.skip.length },
    });
    return;
  }

  // ── Production gate (only relevant for role:production targets) ────────
  const gate = await productionGate({
    target,
    client: targetClient,
    allowProduction: Boolean(options.allowProduction),
    isTTY: process.stdin.isTTY && process.stdout.isTTY,
  });
  if (!gate.ok) bail(gate.reason);

  // ── Final confirmation (skippable for non-prod with --yes) ─────────────
  if (target.role !== 'production' && !options.yes) {
    const proceed = await p.confirm({
      message: `Apply plan to ${target.domain}?`,
      initialValue: false,
    });
    if (p.isCancel(proceed) || !proceed) bail('Cancelled.');
  }

  // ── Snapshot target before write ───────────────────────────────────────
  log.info(`Snapshotting target's current ${entity.label}...`);
  const snap = await snapshot({
    projectRoot: path.dirname(config.configPath),
    store: target,
    entity: entity.id,
    data: targetData,
  });
  log.ok(`Snapshot: ${snap.path}  (${snap.count} item(s))`);

  // ── Apply ──────────────────────────────────────────────────────────────
  log.info(`Applying...`);
  const result = await entity.apply({ client: targetClient, plan, log });
  log.ok(`Done. Created ${result.created}, updated ${result.updated}.`);

  await audit({
    action: 'copy',
    outcome: 'applied',
    entity: entity.id,
    source: source.domain,
    target: target.domain,
    snapshot: snap.path,
    result,
  });
}
