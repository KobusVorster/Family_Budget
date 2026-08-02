/**
 * Inlines the Vite build into one self-contained HTML file.
 *
 * The app has no runtime network calls — React is bundled, the only font is
 * system-ui, and state lives in localStorage — so the whole thing collapses
 * into a single file that opens from disk or from a static host with a strict
 * content policy.
 *
 *   npm run build && node scripts/bundle-single-file.mjs
 *
 * Writes dist/family-budget.html.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');

const files = readdirSync(ASSETS);
const cssName = files.find((name) => name.endsWith('.css'));
const jsName = files.find((name) => name.endsWith('.js'));

if (!cssName || !jsName) {
  throw new Error('No built CSS/JS found in dist/assets — run `npm run build` first.');
}

const css = readFileSync(join(ASSETS, cssName), 'utf8');
// A literal </script> inside a bundled string would close the tag early.
const js = readFileSync(join(ASSETS, jsName), 'utf8').replaceAll('</script', '<\\/script');

const html = `<title>Family Budget</title>
<style>
${css}
</style>

<div id="root"></div>

<script>
  // Apply the saved theme before first paint so there is no flash.
  try {
    var t = localStorage.getItem('family-budget:theme');
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  } catch (e) {}
</script>

<script type="module">
${js}
</script>
`;

const out = join(DIST, 'family-budget.html');
writeFileSync(out, html);
console.log(`${out} — ${(html.length / 1024).toFixed(0)} kB`);
