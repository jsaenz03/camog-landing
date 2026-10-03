// Zero-dependency sanity check for the landing page.
// Fails if: a local asset/font reference is missing, an in-page anchor has no
// target, an external link is not https, or an em/en dash appears in the HTML.
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const css = readFileSync(resolve(root, "styles.css"), "utf8");

const failures = [];
const fail = (msg) => failures.push(msg);

// 1. Every local src/href resolves to a file in the repo.
const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]);
for (const ref of refs) {
  if (/^(https?:|mailto:|data:)/.test(ref)) {
    if (ref.startsWith("http://")) fail(`external link is not https: ${ref}`);
    continue;
  }
  const path = resolve(root, ref);
  if (!existsSync(path)) fail(`missing local file: ${ref}`);
}

// 2. Fonts referenced by the CSS exist.
for (const m of css.matchAll(/url\("(fonts\/[^"]+)"\)/g)) {
  if (!existsSync(resolve(root, m[1]))) fail(`missing font: ${m[1]}`);
}

// 3. Every in-page anchor has an id target.
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
for (const m of html.matchAll(/href="#([^"]+)"/g)) {
  if (!ids.has(m[1])) fail(`anchor #${m[1]} has no target`);
}

// 4. No em dashes or en dashes anywhere in the page copy.
for (const [i, ch] of [...html].entries()) {
  if (ch === "\u2014" || ch === "\u2013") {
    fail(`dash character ${ch} at index ${i} (use a hyphen)`);
    break;
  }
}

// 5. Meta essentials present.
for (const needle of ['rel="canonical"', 'property="og:image"', 'name="description"']) {
  if (!html.includes(needle)) fail(`missing meta: ${needle}`);
}

if (failures.length) {
  console.error("FAIL");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`PASS: ${refs.length} refs, ${ids.size} anchors, fonts, dashes, meta all ok`);
