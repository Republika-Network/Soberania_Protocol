import type { ReactNode } from 'react';
import { ProtocolNav } from '../protocol/Nav';
import { ProtocolFooter } from './ProtocolFooter';
import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs';
import { DOCS_CONTENT_ID, docsStyles } from './docsStyles';

// SOB-PUBLIC-ALIGN-01E (QA-01): the documentation pages are part of the
// Soberanía Protocol site, not a separate product. They reuse the homepage's
// own shell (ProtocolNav, ProtocolFooter with the amethyst accent) and the
// type and colour language of its light content sections (Developers.tsx):
// parchment surface, soberania-serif headings, violet mono eyebrows, slate
// body copy, hairline rules and square violet buttons, with one compact dark
// page header as the top bookend. Readability wins over decoration: no hero
// artwork, one column of prose, wide code blocks scroll on their own.


export function DocsShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f7f3] font-sans text-slate-900">
      <a
        href={`#${DOCS_CONTENT_ID}`}
        className="sr-only z-50 bg-white px-4 py-2 text-sm font-semibold text-violet-800 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-2 focus:outline-violet-700"
      >
        Skip to content
      </a>
      <ProtocolNav />
      <main id={DOCS_CONTENT_ID} tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <ProtocolFooter accent="amethyst" surface="protocol" />
    </div>
  );
}

// Compact dark bookend under the fixed nav: breadcrumb trail, title, lede.
// Its top padding clears the nav at every breakpoint (64px mobile bar; the
// desktop bar scales with the viewport and stays under ~130px).
export function DocsHeader({
  breadcrumbs,
  eyebrow,
  title,
  badges,
  children,
}: {
  breadcrumbs: BreadcrumbItem[];
  eyebrow: string;
  title: ReactNode;
  badges?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden border-b border-violet-200/15 bg-[#080a12] text-white">
      <div className="soberania-atlas-grid absolute inset-0 opacity-35" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-24 sm:px-6 md:pb-16 lg:pt-36">
        <Breadcrumbs items={breadcrumbs} tone="protocol" />
        {badges ? <div className="mt-8 flex flex-wrap items-center gap-3">{badges}</div> : null}
        <p className={`${badges ? 'mt-6' : 'mt-8'} font-mono text-[11px] font-bold uppercase tracking-[.18em] text-violet-200/75`}>
          {eyebrow}
        </p>
        <h1 className="soberania-serif mt-4 max-w-4xl text-[40px] leading-[1.04] tracking-[-.035em] text-white md:text-6xl">
          {title}
        </h1>
        {children}
      </div>
    </header>
  );
}

export function DocsSection({
  id,
  eyebrow,
  title,
  children,
  width = 'wide',
  tinted = false,
}: {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
  width?: 'wide' | 'prose';
  tinted?: boolean;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 border-b border-slate-900/10 ${tinted ? 'bg-[#f3efe6]' : ''}`}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      <div className={`mx-auto px-5 py-14 sm:px-6 md:py-16 ${width === 'prose' ? 'max-w-4xl' : 'max-w-6xl'}`}>
        <p className={docsStyles.eyebrow}>{eyebrow}</p>
        <h2 id={id ? `${id}-title` : undefined} className={docsStyles.h2}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}
