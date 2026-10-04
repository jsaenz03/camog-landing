// Playwright check for the hero film integration (zero npm deps: uses the
// global Playwright install + python3 for the static server).
// Fails if: the hero shot is missing, the modal does not expand, the film
// does not scrub when scrolled, Escape does not collapse it, focus is not
// restored, or any console/CSP error is logged on either document.
// Run: node scripts/film-check.mjs
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(import.meta.url)("/usr/local/lib/node_modules/playwright");
const PORT = 8137;
const failures = [];
const fail = (m) => failures.push(m);

const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });

  // 1. Hero shot present and is a real button with the film affordance.
  const shot = page.locator("#film-open");
  if (!(await shot.isVisible())) fail("hero film shot (#film-open) not visible");
  if (!(await shot.getAttribute("aria-label"))) fail("hero film shot has no aria-label");
  const tag = await page.locator(".shot-live-tag").textContent();
  if (!tag || !tag.includes("Watch the film")) fail("live tag missing 'Watch the film'");

  // 2. Iframe is lazy: no src before the click.
  const preSrc = await page.locator("#film-frame").getAttribute("src");
  if (preSrc) fail(`iframe src set before first open: ${preSrc}`);

  // 3. Click expands the modal and points the iframe at the film.
  await shot.click();
  await page.waitForTimeout(700); // expand animation (550ms)
  if (await page.locator("#film-modal").isHidden()) fail("modal still hidden after open");
  if (!(await page.locator("#film-modal").evaluate((el) => el.classList.contains("open")))) fail("modal missing .open class");
  const src = await page.locator("#film-frame").getAttribute("src");
  if (src !== "film/index.html") fail(`iframe src wrong: ${src}`);
  if (await page.evaluate(() => document.body.style.overflow) !== "hidden") fail("body scroll not locked while open");

  // 4. The film runs: its module hook appears, the preloader finishes,
  //    and scrolling inside the film scrubs the frame state.
  const frame = page.frameLocator("#film-frame");
  const filmPage = page.frames().find((f) => f.url().includes("film/index.html"));
  if (!filmPage) fail("film iframe document not found");
  try {
    await filmPage.waitForFunction(() => window.__state !== undefined, null, { timeout: 15000 });
  } catch { fail("film app.js did not run (window.__state missing)"); }
  try {
    await frame.locator("#loader.done").waitFor({ timeout: 15000 });
  } catch { fail("film preloader never finished (frames did not all load)"); }
  await filmPage.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(900);
  const scrub = await filmPage.evaluate(() => window.__state && window.__state.scrub);
  if (!(scrub > 0.01)) fail(`film did not scrub on scroll (state.scrub=${scrub})`);

  // 4b. Escape pressed while the film iframe has focus must still close the
  //     modal: the film relays it to the parent via postMessage.
  await page.evaluate(() => document.getElementById("film-frame").focus());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  if (await page.locator("#film-modal").isVisible()) fail("modal still visible after Escape inside the film");

  // 5. Escape collapses the modal and restores focus + scroll.
  await shot.click();
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800); // collapse animation + cleanup
  if (await page.locator("#film-modal").isVisible()) fail("modal still visible after Escape");
  const focusId = await page.evaluate(() => document.activeElement && document.activeElement.id);
  if (focusId !== "film-open") fail(`focus not restored to the shot (got: ${focusId})`);
  if (await page.evaluate(() => document.body.style.overflow) !== "") fail("body scroll not unlocked after close");

  // 6. Re-open works (iframe stays loaded).
  await shot.click();
  await page.waitForTimeout(700);
  if (await page.locator("#film-modal").isHidden()) fail("modal did not reopen");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);

  // 7. Standalone /film/ loads on its own (shared-URL path).
  await page.goto(`http://localhost:${PORT}/film/`, { waitUntil: "load" });
  const standalone = page.frames().find((f) => f.url().includes("film/index.html")) || page.mainFrame();
  try {
    await standalone.waitForFunction(() => window.__state !== undefined, null, { timeout: 15000 });
  } catch { fail("standalone /film/ did not run app.js"); }

  // 8. No console or CSP errors anywhere.
  const csp = consoleErrors.filter((t) => /Content Security Policy|Refused to/i.test(t));
  if (csp.length) fail(`CSP violations: ${csp.join(" | ")}`);
  if (consoleErrors.length) fail(`console errors: ${consoleErrors.join(" | ")}`);
} catch (err) {
  fail("unexpected: " + err.message);
} finally {
  await browser.close();
  server.kill();
}

if (failures.length) {
  console.error("FAIL");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("PASS: hero shot, expand, film scrub, collapse, focus, reopen, standalone, no CSP/console errors");
