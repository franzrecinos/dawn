import path from 'node:path';
import fs from 'node:fs';
import fg from 'fast-glob';

const SRC = path.resolve('src');

/**
 * Maps the co-located src/ tree to flat Vite entry names that match Dawn's
 * asset-naming convention so Liquid can keep doing
 *   {{ 'section-foo.css' | asset_url | stylesheet_tag }}
 *   <script src="{{ 'section-foo.js' | asset_url }}" defer></script>
 *
 * Rules:
 *   src/sections/<name>/<name>.{js,css}  -> entry "section-<name>"
 *   src/snippets/<name>/<name>.{js,css}  -> entry "<name>"
 *   src/scripts/<name>.js                -> entry "<name>"
 *   src/styles/<name>.css                -> entry "<name>"
 *
 * If a section/snippet has both .js and .css, .js wins as the entry and is
 * expected to `import './<name>.css'` so Vite emits a sibling CSS file
 * named after the entry.
 */
export function discoverEntries() {
  const entries = {};

  const componentDirs = [
    { glob: 'src/sections/*/', prefix: 'section-' },
    { glob: 'src/snippets/*/', prefix: '' },
  ];

  for (const { glob, prefix } of componentDirs) {
    const dirs = fg.sync(glob, { onlyDirectories: true });
    for (const dir of dirs) {
      const name = path.basename(dir);
      const js = path.join(dir, `${name}.js`);
      const css = path.join(dir, `${name}.css`);
      const entryName = `${prefix}${name}`;

      if (fs.existsSync(js)) {
        entries[entryName] = path.resolve(js);
      } else if (fs.existsSync(css)) {
        entries[entryName] = path.resolve(css);
      }
    }
  }

  // src/scripts/*.js bypass Vite — they're loaded as plain <script defer>
  // and define globals (no ESM exports). Bundling tree-shakes them empty.
  // The copy-scripts plugin handles them instead.

  // Only top-level entry CSS files become assets. Partials (tokens.css, etc.)
  // are imported by base.css and inlined by Vite/Tailwind. Listing them as
  // entries duplicates Tailwind's preflight reset across multiple files.
  const STYLE_ENTRIES = ['base.css'];
  for (const name of STYLE_ENTRIES) {
    const file = path.resolve('src/styles', name);
    if (fs.existsSync(file)) {
      entries[path.basename(file, '.css')] = file;
    }
  }

  return entries;
}
