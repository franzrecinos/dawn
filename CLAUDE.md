# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Dawn is Shopify's reference Online Store 2.0 theme. It is **not** an app — there is no build step, no bundler, no package manager, and no automated test suite. The repository is consumed directly by the Shopify platform, which renders Liquid server-side and serves the files in `assets/` over CDN.

## Common commands

All workflows go through the [Shopify CLI](https://shopify.dev/docs/themes/tools/cli):

```sh
shopify theme dev           # Local dev server with hot reload against a dev store
shopify theme check         # Lint Liquid (config in .theme-check.yml)
shopify theme push          # Upload to a store
shopify theme pull          # Download settings/templates from a store
```

There is no unit-test runner. CI (`.github/workflows/ci.yml`) runs only:
- `shopify/theme-check-action` — Liquid lint
- `shopify/lighthouse-ci-action` — performance budget on home/product/collection pages

Prettier formats JS (`singleQuote: true`) and Liquid (`singleQuote: false`), `printWidth: 120`. The repo relies on the VS Code Theme Check + Prettier extensions (see `.vscode/`) for format-on-save; there is no root `npm` script.

## Theme code principles (enforced in review)

These are non-negotiable per `.github/CONTRIBUTING.md` — assume any PR violating them will be rejected:

- **Web-native, no dependencies.** No frameworks, libraries, polyfills, or build-time abstractions. Vanilla JS + custom elements only. "Don't repeat yourself" is explicitly called out as an anti-pattern here — prefer slight repetition over premature abstraction.
- **Server-rendered.** Business logic (translations, money formatting, pricing) lives in Liquid, not JS. Async/partial rendering is OK only as progressive enhancement.
- **Performance budget.** Targets: zero CLS, no DOM manipulation before user input, no render-blocking JS, no long tasks. Lighthouse CI gates this.
- **Progressive enhancement, not pixel-perfect.** Pages must remain functional without JS and on legacy browsers (no polyfills shipped to support them).

## Architecture

Standard Shopify theme layout — Shopify expects these exact directory names:

| Directory    | Role |
|--------------|------|
| `layout/`    | `theme.liquid` (global wrapper) and `password.liquid`. All `<script>`/`<link>` tags are declared here. |
| `templates/` | One JSON (or Liquid) file per page type — `product.json`, `collection.json`, `cart.json`, `templates/customers/*.json`, etc. JSON templates compose sections by reference. |
| `sections/`  | Reusable Liquid blocks merchants can add/reorder in the theme editor. Files prefixed `main-` (e.g. `main-product.liquid`, `main-cart-items.liquid`) are the primary section for the matching template. `*-group.json` (e.g. `header-group.json`, `footer-group.json`) define section groups. |
| `snippets/`  | Liquid partials, included via `{% render 'name' %}`. Used for shared UI like `card-product`, `price`, `meta-tags`. |
| `assets/`    | Flat directory of all CSS, JS, SVG, and image files. There are **no subdirectories** — Shopify's `asset_url` filter only resolves flat paths. CSS files are typically `component-*.css` or `section-*.css`; JS files are loaded with `defer`. |
| `config/`    | `settings_schema.json` (theme editor schema) and `settings_data.json` (current values). |
| `locales/`   | Buyer translations are `{lang}.json`; merchant-facing theme editor strings are `{lang}.schema.json`. `en.default.json` / `en.default.schema.json` are the source of truth — others are auto-generated (see `translation.yml`). |

### JavaScript conventions

- Each JS file in `assets/` typically defines one or more **custom elements** (Web Components) that hydrate Liquid markup. Sections render `<custom-tag>` wrappers and the matching JS file does `customElements.define(...)`.
- Cross-component communication uses the tiny pub/sub module in `assets/pubsub.js`. Event names live in `assets/constants.js` as `PUB_SUB_EVENTS` (e.g. `cart-update`, `variant-change`, `cart-error`). Use these constants — do not invent new event channels.
- Three globally-loaded files run on every page (declared in `layout/theme.liquid`): `constants.js`, `pubsub.js`, `global.js`. Other JS files are loaded per-section via `<script src="{{ 'foo.js' | asset_url }}" defer>` inside the section that needs them.
- Section IDs follow the `template--<id>__<name>` pattern; use the `SectionId` helper in `global.js` to parse/build them rather than splitting strings manually.

### CSS conventions

- One CSS file per component or section (`component-*.css`, `section-*.css`), loaded via `{{ '...' | asset_url | stylesheet_tag }}` from the section that uses it — not globally. `base.css` carries the shared design tokens.
- Color schemes are generated from `settings.color_schemes` in `layout/theme.liquid` as CSS custom properties (`--color-foreground`, `--color-background`, etc.). Reference these tokens rather than hard-coding colors.

### Liquid conventions

- Section padding/spacing is rendered inline as `<style>` scoped by `.section-{{ section.id }}-padding` so merchants can tune it per-instance from the editor — follow this pattern when adding new sections.
- New merchant-visible strings must be added to `locales/en.default.schema.json`; new buyer-visible strings to `locales/en.default.json`. Do not edit other locale files — they are managed by the translation pipeline defined in `translation.yml`.
