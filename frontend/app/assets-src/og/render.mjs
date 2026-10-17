// Regenerates the Soberanía Protocol Open Graph card from card.html.
//
//   node assets-src/og/render.mjs            (from frontend/app)
//
// 1. Chromium (Playwright) renders card.html at deviceScaleFactor 2 -> 2400x1260.
// 2. downsample.py (Pillow, Lanczos) reduces it to the published 1200x630 PNG
//    plus 400px / 350px previews that approximate LinkedIn feed sizes.
//
// Playwright is not an app dependency; install it once wherever you like and
// point PLAYWRIGHT_PATH at that node_modules if it isn't resolvable from here.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Versioned on purpose: social scrapers cache by URL. Bump the version (and
// SOBERANIA_OG_IMAGE_URL in src/landing/brand.ts + index.html) on every change.
const output = join(here, '../../public/og/soberania-protocol-og-v2.png');
const outDir = join(here, 'out');
const raw = join(outDir, 'card@2x.png');

const require = createRequire(import.meta.url);
const paths = [here, ...(process.env.PLAYWRIGHT_PATH ? [process.env.PLAYWRIGHT_PATH] : [])];
let chromium;
try {
  ({ chromium } = require(require.resolve('playwright', { paths })));
} catch {
  console.error('Playwright not found. `npm i -g playwright` and set PLAYWRIGHT_PATH to its node_modules.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(join(here, 'card.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
await page.locator('.card').screenshot({ path: raw });
await browser.close();

execFileSync('python3', ['-I', join(here, 'downsample.py'), raw, output, outDir], { stdio: 'inherit' });
