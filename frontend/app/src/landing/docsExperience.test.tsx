import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App';
import { DocsPage } from './DocsPage';
import { ManifestoPage } from './ManifestoPage';
import { PACKAGE_NAMES } from './packageIdentity';
import { ProtocolNav } from './protocol/Nav';

// SOB-PUBLIC-ALIGN-01E. QA-01: /docs and /docs/manifesto are part of the
// Soberanía Protocol site (its nav, footer and visual language), not a
// separate black/cyan product. QA-02: the approved, unpublished package names
// are the primary identity; legacy names appear only where factually needed;
// nothing presents an npm install command that would fail or resolve an
// uncontrolled scope.

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');
const meta = (key: string) =>
  document.head.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute('content');

describe('documentation navigation', () => {
  it('renders /docs inside the shared Protocol nav and footer, with a way home', () => {
    const { container } = render(<DocsPage />);

    const nav = screen.getByRole('navigation', { name: 'Soberanía Protocol' });
    expect(within(nav).getAllByRole('link')[0]).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
    expect(container).toHaveTextContent('© 2026 Soberanía Protocol');

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Protocol' })).toHaveAttribute('href', '/');
    expect(within(crumbs).getByText('Documentation')).toHaveAttribute('aria-current', 'page');

    expect(screen.getByRole('link', { name: /Soberanía Manifesto v2\.0/ })).toHaveAttribute('href', '/docs/manifesto');
  });

  it('offers a keyboard skip link to the documentation content', () => {
    render(<DocsPage />);
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    const target = document.getElementById(skip.getAttribute('href')!.slice(1));
    expect(target?.tagName).toBe('MAIN');
    expect(target).toHaveAttribute('tabindex', '-1');
  });

  it('renders /docs/manifesto in the same shell, linked back to /docs and the homepage', () => {
    render(<ManifestoPage />);

    expect(screen.getByRole('navigation', { name: 'Soberanía Protocol' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Protocol' })).toHaveAttribute('href', '/');
    expect(within(crumbs).getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', '/docs');
    expect(within(crumbs).getByText('Manifesto')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Back to documentation' })).toHaveAttribute('href', '/docs');
    expect(screen.getByRole('link', { name: 'Explore Soberanía Protocol' })).toHaveAttribute('href', '/');
  });

  it('reaches /docs from the homepage navigation', () => {
    render(<ProtocolNav />);
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
  });

  it.each([
    ['/docs', 'Build with sovereign digital assets.', '/docs'],
    ['/?view=docs', 'Build with sovereign digital assets.', '/docs'],
    ['/docs/manifesto', 'Building systems that preserve human sovereignty.', '/docs/manifesto'],
  ])('routes %s to the documentation page with canonical %s', (url, heading, path) => {
    window.history.replaceState(null, '', url);
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(canonical()).toBe(`https://soberaniaprotocol.org${path}`);
  });
});

describe('documentation visual system (QA-01)', () => {
  it.each([
    ['/docs', () => render(<DocsPage />)],
    ['/docs/manifesto', () => render(<ManifestoPage />)],
  ])('%s uses the Soberanía surface, not the former black/cyan theme', (_route, renderPage) => {
    const { container } = renderPage();
    const html = container.innerHTML;

    expect(html).not.toMatch(/\bcyan-\d/);
    expect(html).not.toContain('bg-[#0a0a0a]');
    expect(html).not.toContain('bg-[#070b12]');
    expect(container.firstElementChild).toHaveClass('bg-[#f8f7f3]');
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('soberania-serif');
    for (const h2 of screen.getAllByRole('heading', { level: 2 })) expect(h2).toHaveClass('soberania-serif');
  });
});

describe('package naming (QA-02)', () => {
  const pageText = () => render(<DocsPage />).container;

  it('orders the identity hierarchy: upcoming, workspace, historical, unavailable', () => {
    const container = pageText();
    const tiers = [...container.querySelectorAll('[data-identity-tier]')].map((el) => el.getAttribute('data-identity-tier'));
    expect(tiers).toEqual(['identity-upcoming', 'identity-workspace', 'identity-historical', 'identity-unavailable']);

    const upcoming = container.querySelector('#identity-upcoming')!;
    expect(upcoming).toHaveTextContent(PACKAGE_NAMES.protocol);
    expect(upcoming).toHaveTextContent(PACKAGE_NAMES.sdk);
    expect(upcoming).toHaveTextContent('not published');
    expect(upcoming).not.toHaveTextContent('@aoc');
  });

  it('presents the approved name before any legacy name', () => {
    const text = pageText().textContent!;
    expect(text.indexOf(PACKAGE_NAMES.protocol)).toBeGreaterThan(-1);
    expect(text.indexOf(PACKAGE_NAMES.protocol)).toBeLessThan(text.indexOf('@aoc/'));
  });

  it('names a legacy @aoc identity only in the workspace, historical, warning or build-from-source context', () => {
    const container = pageText();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const strays: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent!.includes('@aoc')) continue;
      const allowed = node.parentElement!.closest(
        '#identity-workspace, #identity-historical, #identity-unavailable, pre, [data-legacy-context]',
      );
      if (!allowed) strays.push(node.textContent!.trim());
    }
    expect(strays).toEqual([]);
  });

  it('keeps the working build-from-source steps on the actual workspace name', () => {
    const container = pageText();
    const build = container.querySelector('#getting-started pre')!;
    expect(build).toHaveTextContent(`npm run build --workspace ${PACKAGE_NAMES.legacyProtocolWorkspace}`);
    expect(build).toHaveTextContent('npm run protocol:pack:check');
    expect(build).not.toHaveTextContent('@soberania-protocol');
  });

  it('never presents an npm installation of the new names or of a legacy scope', () => {
    const text = pageText().textContent!;
    expect(text).not.toMatch(/\b(npm\s+(i|install|add)|yarn\s+add|pnpm\s+(add|i|install))\s+(--?\S+\s+)*@soberania-protocol/);
    expect(text).not.toMatch(/\b(npm\s+(i|install|add)|yarn\s+add|pnpm\s+(add|i|install))\s+(--?\S+\s+)*@aoc/);
    expect(text).not.toMatch(/(available|published) on npm(?! today)/i);
    expect(text).toContain('There is no npm install command for Soberanía Protocol yet.');
  });

  it('warns against resolving the uncontrolled @aoc scopes from public npm', () => {
    const warning = pageText().querySelector('#identity-unavailable')!;
    expect(warning).toHaveTextContent('Never install @aoc/* or @aoc-runtime/* from the public npm registry.');
    expect(warning).toHaveTextContent('This project does not control those scopes there');
  });
});

describe('manifesto draft status', () => {
  it('shows the draft status in the page header and in the closing status note', () => {
    const { container } = render(<ManifestoPage />);
    const flags = container.querySelectorAll('[data-status="draft"]');
    expect(flags).toHaveLength(2);
    expect(flags[0].closest('header')).not.toBeNull();
    expect(flags[0]).toHaveTextContent('Draft for Review and Ratification');
    expect(flags[1]).toHaveTextContent('This publication does not represent a ratified constitutional artifact.');
  });

  it('labels the manifesto as a draft from the documentation index', () => {
    render(<DocsPage />);
    expect(screen.getByRole('link', { name: /Soberanía Manifesto v2\.0/ })).toHaveTextContent('Draft');
  });
});

describe('route metadata', () => {
  it('gives /docs its own canonical URL and website metadata', () => {
    render(<DocsPage />);
    expect(canonical()).toBe('https://soberaniaprotocol.org/docs');
    expect(document.title).toBe('Documentation — Soberanía Protocol');
    expect(meta('og:url')).toBe('https://soberaniaprotocol.org/docs');
    expect(meta('og:type')).toBe('website');
  });

  it('gives /docs/manifesto its own canonical URL, a draft title and article metadata', () => {
    render(<ManifestoPage />);
    expect(canonical()).toBe('https://soberaniaprotocol.org/docs/manifesto');
    expect(document.title).toBe('Soberanía Manifesto v2.0 (draft) — Soberanía Protocol');
    expect(meta('og:url')).toBe('https://soberaniaprotocol.org/docs/manifesto');
    expect(meta('og:type')).toBe('article');
  });

  it('restores the previous head when the page unmounts', () => {
    const before = canonical();
    const { unmount } = render(<ManifestoPage />);
    unmount();
    expect(canonical()).toBe(before);
  });
});
