import { pc } from './log.js';

/**
 * Renders a Terraform-style plan: `+ create`, `~ update`, `- delete`, `· skip`.
 * Counts at the bottom. Keep it dumb — no actual diff math, just printing what
 * the entity module decided.
 *
 * `plan` shape:
 *   { create: [{ key, summary }], update: [{ key, summary, before, after }],
 *     skip:   [{ key, reason }],   destroy: [{ key, summary }] (rare) }
 */
export function renderPlan(plan) {
  const sections = [
    { items: plan.create || [], symbol: '+', color: pc.green, label: 'create' },
    { items: plan.update || [], symbol: '~', color: pc.yellow, label: 'update' },
    { items: plan.destroy || [], symbol: '-', color: pc.red, label: 'destroy' },
    { items: plan.skip || [], symbol: '·', color: pc.dim, label: 'skip' },
  ];

  let any = false;
  for (const { items, symbol, color, label } of sections) {
    if (!items.length) continue;
    any = true;
    console.log(color(`\n  ${symbol} ${items.length} ${label}`));
    for (const item of items) {
      const summary = item.summary || item.key || '<unnamed>';
      const reason = item.reason ? pc.dim(` — ${item.reason}`) : '';
      console.log(`    ${color(symbol)} ${summary}${reason}`);
    }
  }

  if (!any) {
    console.log(pc.dim('\n  · 0 changes — source and target are in sync.'));
  }

  const summary = sections
    .filter((s) => s.items.length)
    .map((s) => `${s.color(`${s.items.length} ${s.label}`)}`)
    .join(pc.dim(', '));

  if (summary) {
    console.log(pc.dim('\n  Plan: ') + summary);
  }
}
