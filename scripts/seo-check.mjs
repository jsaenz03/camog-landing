// Zero-dependency SEO/GEO consistency check.
// Fails if: the ld+json block is invalid JSON or missing a @graph type,
// FAQPage schema text diverges from the visible FAQ (word for word, in order),
// meta title/description drift out of length bounds, self URLs leave the site
// domain, or the machine-readable files go stale.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const DOMAIN = "camog.jsaenz.au";
const failures = [];
const fail = (m) => failures.push(m);

// 1. JSON-LD parses and has the expected @graph types.
const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!ld) {
  console.error("FAIL: no ld+json block found");
  process.exit(1);
}
let graph;
try {
  graph = JSON.parse(ld[1]);
} catch (e) {
  console.error(`FAIL: ld+json does not parse: ${e.message}`);
  process.exit(1);
}
const nodes = graph["@graph"] || [];
for (const t of ["Organization", "WebSite", "SoftwareApplication", "HowTo", "FAQPage"]) {
  if (!nodes.some((n) => n["@type"] === t)) fail(`@graph missing ${t}`);
}

// 2. Title 30-60 chars, description 120-160 chars.
const title = html.match(/<title>([^<]+)<\/title>/)[1];
const desc = html.match(/<meta name="description" content="([^"]+)"/)[1];
if (title.length < 30 || title.length > 60) fail(`title length ${title.length} (want 30-60)`);
if (desc.length < 120 || desc.length > 160) fail(`description length ${desc.length} (want 120-160)`);

// 3. Self URLs point at the site domain; no stale self-reference remains.
for (const m of html.matchAll(/(?:rel="canonical" href|property="og:(?:url|image)" content)="([^"]+)"/g)) {
  if (!m[1].includes(DOMAIN)) fail(`self URL not on ${DOMAIN}: ${m[1]}`);
}
if (html.includes("https://camog.cliniciq.com.au")) fail("stale camog.cliniciq.com.au self-reference");

// 4. FAQPage schema mirrors the visible FAQ word for word, in order.
const faqNode = nodes.find((n) => n["@type"] === "FAQPage");
if (faqNode) {
  const listStart = html.indexOf('class="faq-list"');
  const visible = [...html.matchAll(/<details>\s*<summary>([^<]+)<\/summary>\s*<p>([^<]+)<\/p>\s*<\/details>/g)]
    .filter((m) => m.index > listStart);
  faqNode.mainEntity.forEach((q, i) => {
    const v = visible[i];
    if (!v) {
      fail(`schema FAQ ${i} ("${q.name}") has no visible match`);
      return;
    }
    if (q.name !== v[1]) fail(`FAQ ${i} question mismatch: schema "${q.name}" vs visible "${v[1]}"`);
    if (q.acceptedAnswer.text !== v[2]) fail(`FAQ ${i} answer mismatch: schema vs visible`);
  });
  if (faqNode.mainEntity.length !== visible.length) {
    fail(`FAQ count: schema ${faqNode.mainEntity.length} vs visible ${visible.length}`);
  }
}

// 5. Every offer carries price, currency and a checkout URL.
const app = nodes.find((n) => n["@type"] === "SoftwareApplication");
for (const o of app?.offers || []) {
  if (!o.price || o.priceCurrency !== "AUD" || !o.url?.startsWith("https://")) {
    fail(`offer ${o.name} missing price/currency/url`);
  }
}

// 6. Machine-readable files: no em/en dashes, site domain present where needed,
//    llms.txt links the pricing file.
for (const f of ["llms.txt", "pricing.md", "sitemap.xml", "robots.txt"]) {
  const txt = readFileSync(resolve(root, f), "utf8");
  if (/[\u2013\u2014]/.test(txt)) fail(`${f} contains an em/en dash`);
  if ((f === "llms.txt" || f === "sitemap.xml") && !txt.includes(DOMAIN)) fail(`${f} missing ${DOMAIN}`);
}
if (!readFileSync(resolve(root, "llms.txt"), "utf8").includes("pricing.md")) {
  fail("llms.txt does not link pricing.md");
}

if (failures.length) {
  console.error("FAIL");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`PASS: ld+json valid (${nodes.map((n) => n["@type"]).join(", ")}), ${faqNode.mainEntity.length} FAQs mirrored, meta lengths ok, domains ok`);
