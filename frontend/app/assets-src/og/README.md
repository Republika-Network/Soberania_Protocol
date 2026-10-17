# Open Graph card

Source for `public/og/soberania-protocol-og-v2.png`, the 1200×630 card that
LinkedIn, X, Slack and other link unfurlers show for soberaniaprotocol.org.

| File | Role |
| --- | --- |
| `card.html` | The layout, at 1200×630 CSS px. |
| `render.mjs` | Renders `card.html` at 2× with Chromium, then calls `downsample.py`. |
| `downsample.py` | Lanczos-downsamples to 1200×630 and writes 400px / 350px previews to `out/` (git-ignored). |
| `fonts/` | Latin subsets of Fraunces and Figtree, the site's typefaces (SIL OFL 1.1, licences alongside). |

Brand assets are reused, not redrawn: the hero artwork is read straight from
`src/assets/soberania/soberania-hero-mirror.webp`, and the mark's geometry and
Amethyst ramp are copied from `public/favicon-soberania.svg`.

## Regenerate

Requires Node, Python 3 with Pillow, and Playwright with Chromium.

```sh
cd frontend/app
PLAYWRIGHT_PATH="$(npm root -g)" node assets-src/og/render.mjs
```

Check `out/preview-350.png`: the headline must stay legible at that width.

## Changing the card

Social scrapers cache images by URL, so a changed card needs a new filename.
Bump the version in `render.mjs`, `SOBERANIA_OG_IMAGE_URL` in
`src/landing/brand.ts` and the `og:image` / `twitter:image` /
`primaryImageOfPage` URLs in `index.html`, then re-scrape the homepage with
LinkedIn's Post Inspector.
