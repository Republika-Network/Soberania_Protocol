import { useEffect } from 'react';
import { SOBERANIA_OG_IMAGE_URL, SOBERANIA_PROTOCOL_URL } from '../brand';

export type RouteMeta = {
  /** Path on the canonical origin, e.g. '/docs'. */
  path: string;
  title: string;
  description: string;
  ogType?: 'website' | 'article';
};

// Per-route document head for the public Protocol pages that have their own
// URL (/docs, /docs/manifesto). Without it those routes inherit index.html's
// canonical link to '/', which tells search engines the page is a duplicate of
// the homepage even though sitemap.xml lists it. Everything changed here is
// restored on unmount so client-side navigation never leaks one page's head
// into another.
export function useRouteMeta({ path, title, description, ogType = 'website' }: RouteMeta) {
  useEffect(() => {
    const url = `${SOBERANIA_PROTOCOL_URL}${path}`;
    const restorers: Array<() => void> = [];

    const prevTitle = document.title;
    document.title = title;
    restorers.push(() => {
      document.title = prevTitle;
    });

    const upsert = (selector: string, create: () => HTMLElement, attr: string, value: string) => {
      let el = document.head.querySelector(selector) as HTMLElement | null;
      const created = !el;
      if (!el) {
        el = create();
        document.head.appendChild(el);
      }
      const prev = el.getAttribute(attr);
      el.setAttribute(attr, value);
      restorers.push(() => {
        if (created) el!.remove();
        else if (prev !== null) el!.setAttribute(attr, prev);
      });
    };

    const meta = (key: string, content: string, prop = false) => {
      const attr = prop ? 'property' : 'name';
      upsert(
        `meta[${attr}="${key}"]`,
        () => {
          const el = document.createElement('meta');
          el.setAttribute(attr, key);
          return el;
        },
        'content',
        content,
      );
    };

    upsert(
      'link[rel="canonical"]',
      () => {
        const el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        return el;
      },
      'href',
      url,
    );
    meta('description', description);
    meta('og:title', title, true);
    meta('og:description', description, true);
    meta('og:url', url, true);
    meta('og:type', ogType, true);
    meta('og:image', SOBERANIA_OG_IMAGE_URL, true);
    meta('og:site_name', 'Soberanía Protocol', true);
    meta('twitter:title', title);
    meta('twitter:description', description);

    return () => {
      restorers.reverse().forEach((restore) => restore());
    };
  }, [path, title, description, ogType]);
}
