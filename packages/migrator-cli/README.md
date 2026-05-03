# @nomeo/migrator-cli

Interactive CLI for migrating Shopify entities (metafield definitions, metaobjects, products, …) between dev / staging / production stores.

The pain it solves: you build a feature on a dev store and now have to recreate every metaobject definition, every metafield, every product variant, every redirect by hand on staging and prod. The CLI does it as a deterministic, idempotent diff — same model as Terraform: extract, plan, apply.

The other half is **safeguards**, because cross-store writes are exactly the kind of operation that ends quarters. Every destructive command runs through a layered gate before touching the API. See [Safeguards](#safeguards) below.

## Status — v0.1 (spike)

Working today:

- `init` — scaffold `migrator.config.json` interactively
- `stores add | list | remove` — manage per-store access tokens (verified against Shopify before storing, scope-checked for production)
- `copy metafields --from <alias> --to <alias>` — extract metafield **definitions** from both stores, diff, render plan, apply
- All Tier-1 safeguards wired in (direction matrix, production gate w/ live `passwordEnabled` check, typed domain confirmation, dry-run default, auto-snapshot, idempotency by content hash, audit log, domain-similarity warning)

Not yet:

- `metaobjects`, `products`, `collections`, `menus`, `pages`, `redirects`, `files`, `locales`
- `seed customers` / `seed orders` (deliberately *not* `copy` — see [Pitfalls](#pitfalls))
- `diff <entity>`, `export`, `import` (the snapshot mechanism is in place; the commands aren't)

The spike's purpose is to lock the architecture, prompt UX, and safeguard plumbing. Adding entities is mostly a per-schema implementation of `extract` / `planDiff` / `apply`.

## Install

```sh
cd packages/migrator-cli
npm install

# Optional: link as a global `migrator` command for convenience
npm link
```

Without `npm link`, invoke it as `node packages/migrator-cli/bin/migrator.js …`.

## Quick start

```sh
# 1. From your project root (anywhere with a migrator.config.json above it)
migrator init

# 2. Generate Custom App access tokens in each store admin
#    (Settings → Apps and sales channels → Develop apps → Create app),
#    then store them locally:
migrator stores add dev
migrator stores add staging

# 3. See what would change — dry-run
migrator copy metafields --from dev --to staging

# 4. Actually do it
migrator copy metafields --from dev --to staging --apply

# 5. For production, the gate kicks in
migrator copy metafields --from staging --to prod --apply --allow-production
#   ↑ requires storefront password ON, typed domain confirmation, no --yes
```

## Configuration

`migrator.config.json` lives at the root of the project that uses the CLI. It's safe to commit (no secrets):

```json
{
  "version": 1,
  "stores": {
    "dev":     { "domain": "nomeo-dev.myshopify.com",     "role": "development", "owner": "us" },
    "staging": { "domain": "nomeo-staging.myshopify.com", "role": "staging",     "owner": "us" },
    "prod":    { "domain": "nomeo.myshopify.com",         "role": "production",  "owner": "us" }
  }
}
```

Fields:

| Field | Required | Notes |
|-------|----------|-------|
| `domain` | ✓ | Must end in `.myshopify.com`. The custom domain (`nomeo.com`) is not accepted — the CLI talks to the canonical store URL only. |
| `role` | ✓ | `development` \| `staging` \| `production`. Drives the [direction matrix](#direction-matrix) and the [production gate](#production-rule). |
| `owner` | ✓ | `us` \| `client`. Cross-owner writes are blocked unless **both** stores set `crossOwner: true`. |
| `crossOwner` | – | Default `false`. Set on the *client*-owned store entry to opt into cross-owner writes. Both ends must opt in. |

Tokens never go in this file. They live at `~/.config/nomeo-migrator/credentials.json` (mode 0600), keyed by store domain so multiple projects share them. Or override per-invocation with `SHOPIFY_TOKEN_<DOMAIN_AS_ENV>=shpat_…`.

## Safeguards

Every destructive command passes through these in order:

### Direction matrix

Allowed source → target pairs:

| | → dev | → staging | → production |
|---|---|---|---|
| **dev → ** | ✓ | ✓ | ⚠ gated |
| **staging → ** | ✓ | ✓ | ⚠ gated |
| **production → ** | ✓ (read-down is safe) | ✓ | ✗ self-write blocked |

`development ↔ staging` is the freely-bidirectional path. Reading *down* from production (e.g. `prod → dev` to debug against live data) is always permitted.

### Production rule

Writes to a `role: production` store are **denied** unless **all** of:

1. `--allow-production` is on the command line
2. `passwordEnabled` is `true` on the live shop, queried fresh on every run (we never trust cached state). REST fallback queries `/shop.json.password_enabled`.
3. Operator types the `*.myshopify.com` domain at the prompt (no copy-paste — keystroke-detected).
4. The terminal is interactive — `--yes` is **rejected** for production targets, even in CI.

The `passwordEnabled` check is intentionally live. The instant a merchant flips off password protection (= goes public), the next migration attempt denies. Self-disabling guardrail.

Honest caveat: `passwordEnabled = true` doesn't *prove* the store is pre-launch — a merchant could password-protect for maintenance. The safety comes from the combined gate, not any single signal.

### Other Tier-1 guards

| Guard | Where |
|-------|-------|
| **Dry-run default** | `copy <entity>` always runs as a plan. `--apply` flips it to write. |
| **Auto-snapshot before write** | Target's current state is exported to `<projectRoot>/.migrator/snapshots/<ts>-<store>-<entity>.json` and verified (re-read + count match) before mutations run. No snapshot, no write. |
| **Idempotency by content hash** | Each entity's stable fields → SHA-256. Re-runs against unchanged source produce zero changes. |
| **Audit log** | JSON-lines append-only at `~/.config/nomeo-migrator/audit.log`. Every action and every safeguard refusal logs a line. Print path: `migrator audit-log`. |
| **Domain-similarity warning** | Source and target handles within Levenshtein 2 surface a red warning before the run starts (catches `nomeo-prod` vs `nomeo-pord`). |
| **Token scope verification on `stores add`** | Hits `/oauth/access_scopes.json`. Adding a `production` store with write scopes when read scopes would suffice surfaces a warning. |
| **Token-domain mismatch refusal** | If the entered token belongs to a different store than the one configured, the CLI refuses to persist it. |

### Tier 2 / Tier 3 (planned)

Not in v0.1 but the architecture supports them:

- Visual colored diff (currently shows summary lines; full `before → after` field diff is a `ui/diff.js` extension)
- Rate-limit circuit breaker on consecutive 429s (the client tracks this; needs surfacing in the run loop)
- Time-window denial / quiescence period (config knobs not yet defined)
- Two-token production (one for read, one for promote)
- Repo-level `.migrator-locked` file to freeze a branch

## Pitfalls (deliberate non-features)

- **No `copy customers` / `copy orders`.** Copying real PII across environments is a privacy/compliance problem in every regulated jurisdiction. The CLI exposes `seed customers` / `seed orders` instead — generators of fake data — once those land. If you need real customer data on staging, anonymize first, outside this tool.
- **No `--force-delete`.** Definitions present on the target but not on the source are never proposed for destroy. Deletion of metafield/metaobject schemas detaches data and is dangerous; a future `migrator destroy <entity>` will be a separate command with its own gate.
- **App-installed metafield namespaces.** Some namespaces are owned by apps (e.g. `judge_me.*`). Copying these to a store that doesn't have the app installed orphans them. The metafield extractor flags them and the diff skips by default.
- **Reference cycles in metaobject entries** (when implemented): topo-sort the upserts, two-pass for cycles — create stubs first, then update with real references.
- **File URLs in metaobject/metafield values** (when implemented): a `cdn.shopify.com` URL on store A doesn't resolve from store B. The file entity uploader rewrites these as part of the entry copy.
- **Theme references.** The theme can reference metaobjects/metafields by handle. If the theme expects `nomeo.region` and that hasn't been migrated yet, the storefront breaks silently. CLI should surface "theme references X; X isn't on target" — open work.

## Architecture (one screen)

```
bin/migrator.js                          shebang entry
src/index.js                             cac-based command router

src/commands/
  init.js                                interactive scaffold of migrator.config.json
  stores.js                              add | list | remove tokens
  copy.js                                the orchestrator: load → safeguards → extract → diff → render → apply

src/registry/
  config.js                              load/validate migrator.config.json
  credentials.js                         per-machine token store at ~/.config/nomeo-migrator/credentials.json (0600)
  audit.js                               JSON-lines append-only audit log

src/clients/
  shopify.js                             wraps @shopify/admin-api-client + REST helper + cost-based throttling

src/safeguards/
  direction.js                           role-pair allow/deny matrix
  production-gate.js                     live passwordEnabled check + typed-domain confirmation
  domain-check.js                        Levenshtein typo guard
  hash.js                                stable content hash (deterministic JSON.stringify)
  snapshot.js                            export-and-verify before any write

src/entities/
  index.js                               registry of available entities
  metafield-definitions.js               extract / planDiff / apply for metafield schemas

src/ui/
  prompts.js                             @clack/prompts wrappers (typedConfirmation lives here)
  log.js                                 picocolors output helpers
  diff.js                                Terraform-style plan renderer
```

Every entity exposes the same three-function shape:

```js
export const id = '...';                 // canonical name
export const label = '...';              // human-readable
export async function extract(client) { … }     // pull from one store
export function planDiff({ source, target }) { … }  // build {create, update, skip, destroy}
export async function apply({ client, plan, log }) { … }  // execute, return { created, updated }
```

Adding a new entity is a single file + one line in `entities/index.js`.

## Development

```sh
node bin/migrator.js --help              # smoke test
node bin/migrator.js stores --help
node bin/migrator.js audit-log
```

There are no unit tests yet. The first ones to write are around `safeguards/` (direction matrix, hash determinism, domain-similarity edge cases) — pure functions, no Shopify dependency.

## Why not in the theme repo's root?

The theme is one product, the migrator is another. Keeping them as siblings under `packages/` lets each evolve independently — the migrator could become its own published npm package later without disturbing the theme's build pipeline. We deliberately did **not** promote the repo to npm workspaces yet; it's not worth the churn until there's a third package.
