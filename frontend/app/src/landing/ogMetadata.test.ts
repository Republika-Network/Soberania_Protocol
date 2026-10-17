import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOBERANIA_OG_IMAGE_URL, SOBERANIA_PROTOCOL_URL } from './brand';

// Social scrapers (LinkedIn, X, Slack) don't run JS, so the card must be
// declared in the static index.html, and the file it names must exist at the
// size the tags claim. See assets-src/og/README.md.
const appRoot = resolve(__dirname, '../..');
const html = readFileSync(resolve(appRoot, 'index.html'), 'utf8');

const meta = (attr: 'property' | 'name', key: string) =>
  html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];

describe('Open Graph card', () => {
  it('is an absolute, versioned URL on the canonical origin', () => {
    expect(SOBERANIA_OG_IMAGE_URL).toBe(`${SOBERANIA_PROTOCOL_URL}/og/soberania-protocol-og-v2.png`);
  });

  it('is declared in the server-served index.html with dimensions and alt text', () => {
    expect(meta('property', 'og:image')).toBe(SOBERANIA_OG_IMAGE_URL);
    expect(meta('property', 'og:image:secure_url')).toBe(SOBERANIA_OG_IMAGE_URL);
    expect(meta('property', 'og:image:type')).toBe('image/png');
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
    expect(meta('property', 'og:image:alt')).toMatch(/Soberanía Protocol/);
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('name', 'twitter:image')).toBe(SOBERANIA_OG_IMAGE_URL);
    expect(meta('name', 'twitter:image:alt')).toBe(meta('property', 'og:image:alt'));
  });

  it('ships as a 1200x630 PNG in public/', () => {
    const png = readFileSync(resolve(appRoot, 'public', new URL(SOBERANIA_OG_IMAGE_URL).pathname.slice(1)));
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    // IHDR width and height, big-endian, at bytes 16..23.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});
