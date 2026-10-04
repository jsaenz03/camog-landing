# camog-landing

Marketing landing page for [Camog](https://cliniciq.com.au), the local-first
clinical photography app for Australian GPs. Plain HTML/CSS/JS: no build step,
no external requests, no analytics, no cookies.

## Structure

- `index.html` — the whole page (hero, problem stats, feature bento, setup
  steps, privacy, pricing, FAQ, CTA)
- `film/` — the scroll-driven product film (120 frames in `frames-nas/`,
  vendored GSAP/ScrollTrigger/Lenis, self-hosted Plex Mono 600). The hero
  shot cycles three film frames; pressing it expands `/film/` into a
  fullscreen modal. Noindex, not in the sitemap.
- `styles.css` — brand tokens (teal `#00565B` / `#007B82`, paper `#F3F7F6`),
  Oswald display + IBM Plex Mono, light and dark via `prefers-color-scheme`
- `script.js` — scroll reveal, hero frame crossfade, film modal (FLIP
  expand/collapse, focus trap, Escape); page is fully readable without JS
- `fonts/` — self-hosted woff2 (Oswald variable, IBM Plex Mono 400/500/700)
- `assets/` — logo, dashboard screenshot, favicons, OG image
- `_headers` / `netlify.toml` — Netlify config (static publish, strict CSP)

## Preview

```sh
python3 -m http.server 8080
# http://localhost:8080
```

## Deploy (Netlify)

Connect this repo to Netlify with: build command **none**, publish directory
`.` (the included `netlify.toml` already says this). Every push deploys.

## Before going live

- **Domain**: the canonical URL and OG tags point at `https://camog.jsaenz.au/`.
  If the site lands on a different domain, update `rel="canonical"`, the
  `og:url` and `og:image` meta tags, the `@id`/`url` values in the JSON-LD
  schema block, `robots.txt`, `sitemap.xml` and `llms.txt`.
- **macOS link**: the download CTA points at
  `github.com/jsaenz03/camorg/releases/latest`; keep it in sync with how
  builds are actually distributed.

## Copy sources

Pricing, trial terms, privacy claims and the JAMA/OAIC statistics come from
`camog/marketing/email/camog-launch-email.html` (keep the two in sync when
facts change). Licence and legal links point at
`camog-license.cliniciq.com.au`.

## Check

```sh
node scripts/check.mjs
node scripts/seo-check.mjs
```

The first asserts every local asset reference resolves, every in-page anchor
has a target, external links are https, and no em/en dashes slipped into the
copy. The second asserts the JSON-LD schema parses, the FAQPage markup mirrors
the visible FAQ word for word, meta lengths stay in range, and self URLs stay
on the site domain.
