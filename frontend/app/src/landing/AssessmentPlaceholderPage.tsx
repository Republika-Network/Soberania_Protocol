import { useEffect } from 'react';
import { LogoRotating } from '../components/logo/LogoRotating';
import { CONSTITUTIONAL_INDEX_ORGANIZATIONS } from './assuranceIndexData';
import { SOBERANIA_OG_IMAGE_URL, SOBERANIA_PROTOCOL_URL } from './brand';
import './assurance.css';

const QUADRANT_META = {
  'constitutional-leaders': { label: 'Constitutional Leaders', textClass: 'text-emerald-300', borderClass: 'border-emerald-500/20', bgClass: 'bg-emerald-500/5' },
  'trusted-custodians':    { label: 'Trusted Custodians',    textClass: 'text-indigo-300',  borderClass: 'border-indigo-500/20',  bgClass: 'bg-indigo-500/5'  },
  'dependency-platforms':  { label: 'Dependency Platforms',  textClass: 'text-orange-300',  borderClass: 'border-orange-500/20',  bgClass: 'bg-orange-500/5'  },
  'sovereignty-pioneers':  { label: 'Sovereignty Pioneers',  textClass: 'text-sky-300',     borderClass: 'border-sky-500/20',     bgClass: 'bg-sky-500/5'     },
};

function useAssessmentMeta(orgName: string, slug: string) {
  useEffect(() => {
    const prevTitle = document.title;
    const pageUrl = `${SOBERANIA_PROTOCOL_URL}/research/${slug}-assessment`;

    const setMeta = (name: string, content: string, prop = false) => {
      const attr = prop ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      const created = !el;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
      return created ? el : null;
    };

    const setLink = (rel: string, href: string) => {
      let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      const prevHref = el?.getAttribute('href') ?? null;
      const created = !el;
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
      return { el, prevHref, created };
    };

    document.title = `${orgName} Constitutional Assessment | Soberanía Assurance`;
    setMeta('description', `Constitutional assessment of ${orgName} — Governance Score, Sovereignty Score, and Constitutional Position. Evaluated by Soberanía Assurance.`);
    setMeta('robots', 'index, follow');

    const { el: canonicalEl, prevHref: prevCanonical } = setLink('canonical', pageUrl);

    setMeta('og:title', `${orgName} Constitutional Assessment | Soberanía Assurance`, true);
    setMeta('og:description', `Independent constitutional assessment of ${orgName} evaluating AI Governance and Sovereignty dimensions.`, true);
    setMeta('og:url', pageUrl, true);
    setMeta('og:type', 'article', true);
    setMeta('og:image', SOBERANIA_OG_IMAGE_URL, true);
    setMeta('og:site_name', 'Soberanía Assurance', true);
    setMeta('twitter:card', 'summary_large_image');

    const jsonLd = document.createElement('script');
    jsonLd.type = 'application/ld+json';
    jsonLd.id = `assessment-${slug}-jsonld`;
    jsonLd.text = JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: `${orgName} Constitutional Assessment | Soberanía Assurance`,
        url: pageUrl,
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Soberanía Assurance', item: SOBERANIA_PROTOCOL_URL },
            { '@type': 'ListItem', position: 2, name: 'Research Hub', item: `${SOBERANIA_PROTOCOL_URL}/research` },
            { '@type': 'ListItem', position: 3, name: `${orgName} Assessment`, item: pageUrl },
          ],
        },
      },
    ]);
    document.head.appendChild(jsonLd);

    return () => {
      document.title = prevTitle;
      const injected = document.getElementById(`assessment-${slug}-jsonld`);
      if (injected) injected.remove();
      if (prevCanonical !== null) canonicalEl.setAttribute('href', prevCanonical);
    };
  }, [orgName, slug]);
}

export function AssessmentPlaceholderPage({ slug }: { slug: string }) {
  const org = CONSTITUTIONAL_INDEX_ORGANIZATIONS.find((o) => o.slug === slug);
  const orgName = org?.name ?? slug;

  useAssessmentMeta(orgName, slug);

  const meta = org ? QUADRANT_META[org.quadrant] : null;

  return (
    <main className="min-h-screen bg-[#070d0b] text-white font-sans antialiased">
      <nav
        className="flex items-center justify-between gap-4 border-b border-white/8 px-4 py-3 sm:px-6"
        aria-label="Assessment page navigation"
      >
        <a href="/research" className="flex items-center gap-2.5" aria-label="Back to Research Hub">
          <LogoRotating size={26} inverted />
          <span className="text-sm font-semibold text-white/90">Soberanía Assurance</span>
        </a>
        <a
          href="/research"
          className="text-xs text-white/50 hover:text-white/80 transition-colors"
        >
          ← Research Hub
        </a>
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 text-center">
        <nav aria-label="Breadcrumb" className="flex justify-center mb-8">
          <ol className="flex items-center gap-2 text-xs text-white/35">
            <li><a href="/research" className="hover:text-white/60 transition-colors">Research Hub</a></li>
            <li aria-hidden="true">/</li>
            <li className="text-white/55">{orgName} Assessment</li>
          </ol>
        </nav>

        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-300/60">
          Constitutional Assessment
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {orgName}
        </h1>

        {org && meta && (
          <div className={`mx-auto mt-6 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${meta.borderClass} ${meta.textClass}`}>
            {meta.label}
          </div>
        )}

        <div className="mx-auto mt-12 max-w-md rounded-2xl border border-white/10 bg-white/[0.02] px-8 py-10">
          <div className="h-10 w-10 rounded-full border border-cyan-500/25 bg-cyan-500/10 flex items-center justify-center mx-auto mb-5">
            <span className="text-cyan-300 text-lg" aria-hidden="true">◎</span>
          </div>
          <p className="text-base font-medium text-white/80">Assessment coming soon.</p>
          <p className="mt-3 text-sm text-white/45 leading-relaxed">
            The full constitutional assessment for {orgName} is in preparation and will be published to the Soberanía Research Hub.
          </p>
          <a
            href="/assurance/intelligence-risk#index"
            className="mt-8 inline-flex items-center justify-center rounded-xl border border-white/15 px-5 py-2.5 text-sm font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white"
          >
            View Constitutional Index
          </a>
        </div>

        <div className="mt-10">
          <a href="/research" className="text-sm text-white/40 hover:text-white/65 transition-colors">
            ← Back to Research Hub
          </a>
        </div>
      </div>
    </main>
  );
}
