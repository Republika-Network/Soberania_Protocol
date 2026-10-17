import { useEffect, useState } from 'react';
import { LogoRotating } from '../components/logo/LogoRotating';
import { SOBERANIA_OG_IMAGE_URL, SOBERANIA_PROTOCOL_URL } from './brand';
import './assurance.css';

const PAGE_URL = `${SOBERANIA_PROTOCOL_URL}/what-is-ai-sovereignty`;

// ── Metadata ──────────────────────────────────────────────────────────────────

function usePageMeta() {
  useEffect(() => {
    const prevTitle = document.title;

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

    document.title = 'What is AI Sovereignty? | Soberanía Assurance';

    setMeta(
      'description',
      'AI Sovereignty is the ability of an organization to control, operate, move, replace, and preserve independence over its AI capabilities. Learn how Soberanía Assurance measures AI Sovereignty.',
    );
    setMeta(
      'keywords',
      'What is AI Sovereignty, AI Sovereignty, Sovereign AI, AI Sovereignty Framework, AI Sovereignty Assessment, AI Sovereignty Score, AI Independence, AI Vendor Lock-in, Constitutional AI, Soberanía Assurance, Soberanía Constitutional Index',
    );
    setMeta('robots', 'index, follow');

    const { el: canonicalEl, prevHref: prevCanonical } = setLink('canonical', PAGE_URL);

    setMeta('og:title', 'What is AI Sovereignty? | Soberanía Assurance', true);
    setMeta(
      'og:description',
      'AI Sovereignty measures how much control an organization truly has over its AI capabilities, infrastructure, data, continuity, and operational independence.',
      true,
    );
    setMeta('og:url', PAGE_URL, true);
    setMeta('og:type', 'article', true);
    setMeta('og:image', SOBERANIA_OG_IMAGE_URL, true);
    setMeta('og:site_name', 'Soberanía Assurance', true);

    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', 'What is AI Sovereignty? | Soberanía Assurance');
    setMeta(
      'twitter:description',
      'AI Sovereignty measures how much control an organization truly has over its AI capabilities, infrastructure, data, continuity, and operational independence.',
    );
    setMeta('twitter:site', '@archofchange');

    const jsonLd = document.createElement('script');
    jsonLd.type = 'application/ld+json';
    jsonLd.id = 'what-is-ai-sovereignty-jsonld';
    jsonLd.text = JSON.stringify(buildJsonLd());
    document.head.appendChild(jsonLd);

    return () => {
      document.title = prevTitle;
      const injected = document.getElementById('what-is-ai-sovereignty-jsonld');
      if (injected) injected.remove();
      if (prevCanonical !== null) canonicalEl.setAttribute('href', prevCanonical);
    };
  }, []);
}

const FAQS = [
  {
    q: 'What is AI Sovereignty?',
    a: 'AI Sovereignty is the ability of an organization to control, operate, move, replace, and preserve independence over the AI capabilities that power its business.',
  },
  {
    q: 'Why does AI Sovereignty matter?',
    a: 'AI Sovereignty matters because organizations increasingly depend on AI providers for critical capabilities. Weak sovereignty can create vendor lock-in, continuity risk, portability limitations, and reduced operational autonomy.',
  },
  {
    q: 'What is an AI Sovereignty Score?',
    a: 'An AI Sovereignty Score evaluates how much control an organization has over its AI capabilities, including infrastructure, data, models, portability, continuity, and provider dependency.',
  },
  {
    q: 'Can an organization have strong governance but weak sovereignty?',
    a: 'Yes. An organization may have strong policies, controls, and oversight while remaining dependent on a single provider for infrastructure, models, data movement, or continuity.',
  },
  {
    q: 'Can an organization have strong sovereignty but weak governance?',
    a: 'Yes. An organization may control its infrastructure, data, and models while lacking mature oversight, accountability, auditability, or operational controls.',
  },
  {
    q: 'How is AI Sovereignty measured?',
    a: 'Soberanía Assurance measures AI Sovereignty through evidence related to infrastructure control, data control, model optionality, portability, continuity, operational independence, and provider dependency.',
  },
  {
    q: 'What creates vendor lock-in in AI systems?',
    a: 'Vendor lock-in can emerge from dependency on proprietary models, closed data formats, non-portable workflows, provider-specific integrations, memory systems, evaluation layers, and lack of exit paths.',
  },
  {
    q: 'What is the relationship between AI Sovereignty and AI Trust?',
    a: 'AI Trust depends not only on whether systems are governed, but also on whether organizations retain meaningful control over the capabilities they depend on. Sovereignty strengthens trust by reducing hidden dependency risk.',
  },
];

function buildJsonLd() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'What is AI Sovereignty? | Soberanía Assurance',
      description:
        'AI Sovereignty is the ability of an organization to control, operate, move, replace, and preserve independence over its AI capabilities.',
      url: PAGE_URL,
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SOBERANIA_PROTOCOL_URL },
          { '@type': 'ListItem', position: 2, name: 'Soberanía Assurance', item: `${SOBERANIA_PROTOCOL_URL}/assurance/intelligence-risk` },
          { '@type': 'ListItem', position: 3, name: 'What is AI Sovereignty?', item: PAGE_URL },
        ],
      },
      publisher: {
        '@type': 'Organization',
        name: 'Soberanía Assurance',
        url: SOBERANIA_PROTOCOL_URL,
        logo: { '@type': 'ImageObject', url: `${SOBERANIA_PROTOCOL_URL}/og-image.png` },
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'What is AI Sovereignty?',
      description:
        'AI Sovereignty is the ability of an organization to control, operate, move, replace, and preserve independence over its AI capabilities.',
      url: PAGE_URL,
      image: `${SOBERANIA_PROTOCOL_URL}/og-image.png`,
      author: {
        '@type': 'Organization',
        name: 'Soberanía Assurance',
        url: SOBERANIA_PROTOCOL_URL,
      },
      publisher: {
        '@type': 'Organization',
        name: 'Soberanía Assurance',
        url: SOBERANIA_PROTOCOL_URL,
      },
      about: [
        { '@type': 'Thing', name: 'AI Sovereignty' },
        { '@type': 'Thing', name: 'AI Governance' },
        { '@type': 'Thing', name: 'Constitutional AI' },
        { '@type': 'Thing', name: 'Vendor Lock-in' },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Soberanía Constitutional Assessment',
      description:
        'Constitutional assessments evaluating AI Governance and AI Sovereignty to establish constitutional posture and trust.',
      provider: {
        '@type': 'Organization',
        name: 'Soberanía Assurance',
        url: SOBERANIA_PROTOCOL_URL,
      },
      url: `${SOBERANIA_PROTOCOL_URL}/assurance/intelligence-risk`,
    },
  ];
}

// ── Dimension Card ────────────────────────────────────────────────────────────

function DimensionCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 flex flex-col gap-2.5 hover:border-white/18 transition-colors">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="text-sm text-white/55 leading-relaxed">{description}</p>
    </div>
  );
}

// ── FAQ Item ──────────────────────────────────────────────────────────────────

function FaqItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  const id = `faq-${index}`;
  return (
    <div className="border-b border-white/8 last:border-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 py-5 text-left"
      >
        <span className="text-sm font-medium text-white/85 leading-snug">{q}</span>
        <span
          className="mt-0.5 shrink-0 text-white/35 transition-transform duration-200"
          style={{ transform: open ? 'rotate(45deg)' : 'none' }}
          aria-hidden="true"
        >
          +
        </span>
      </button>
      {open && (
        <div id={id} role="region" aria-label={q} className="pb-5">
          <p className="text-sm text-white/55 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

// ── Page Nav ──────────────────────────────────────────────────────────────────

function PageNav() {
  return (
    <nav
      className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-white/8 bg-[#070d0b]/90 px-4 py-3 backdrop-blur-md sm:px-6"
      aria-label="Page navigation"
    >
      <a href="/assurance/intelligence-risk" className="flex items-center gap-2.5" aria-label="Soberanía Assurance home">
        <LogoRotating size={26} inverted />
        <span className="text-sm font-semibold text-white/90">Soberanía Assurance</span>
      </a>
      <div className="flex items-center gap-4">
        <a href="/research" className="hidden sm:inline text-xs text-white/50 hover:text-white/80 transition-colors">
          Research Hub
        </a>
        <a
          href="/ai-governance-vs-ai-sovereignty"
          className="hidden sm:inline text-xs text-white/50 hover:text-white/80 transition-colors"
        >
          Governance vs Sovereignty
        </a>
        <a
          href="/assurance/intelligence-risk"
          className="rounded-xl border border-white/15 px-3.5 py-1.5 text-xs font-medium text-white/75 transition-colors hover:border-white/30 hover:text-white"
        >
          View Index
        </a>
      </div>
    </nav>
  );
}

// ── Page Footer ───────────────────────────────────────────────────────────────

function PageFooter() {
  return (
    <footer className="border-t border-white/8 bg-[#050d0a] px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-4xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/30 mb-3">Related</p>
          <div className="flex flex-col gap-2">
            <a href="/ai-governance-vs-ai-sovereignty" className="text-sm text-white/50 hover:text-white/80 transition-colors">
              AI Governance vs AI Sovereignty →
            </a>
            <a href="/research" className="text-sm text-white/50 hover:text-white/80 transition-colors">
              Constitutional AI Research Hub →
            </a>
            <a href="/assurance/methodology" className="text-sm text-white/50 hover:text-white/80 transition-colors">
              Assessment Methodology →
            </a>
            <a href="/assurance/intelligence-risk#index" className="text-sm text-white/50 hover:text-white/80 transition-colors">
              Constitutional Index →
            </a>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs text-white/25">© 2026 Soberanía Protocol / OnchainFest LLC</p>
          <p className="text-xs text-white/20 mt-1">Soberanía Assurance</p>
        </div>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function WhatIsAiSovereigntyPage() {
  usePageMeta();

  return (
    <main className="min-h-screen bg-[#070d0b] text-white font-sans antialiased" id="top">
      <PageNav />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden border-b border-white/8 px-4 pb-20 pt-20 sm:px-6 sm:pt-28 sm:pb-28"
        aria-labelledby="hero-heading"
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <div className="h-[500px] w-[800px] rounded-full bg-sky-500/[0.05] blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-3xl">
          <nav aria-label="Breadcrumb" className="mb-8">
            <ol className="flex items-center gap-2 text-xs text-white/30">
              <li><a href="/assurance/intelligence-risk" className="hover:text-white/55 transition-colors">Soberanía Assurance</a></li>
              <li aria-hidden="true">/</li>
              <li className="text-white/50">What is AI Sovereignty?</li>
            </ol>
          </nav>

          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-300/70">
            SOBERANÍA CONSTITUTIONAL INDEX
          </p>
          <h1
            id="hero-heading"
            className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-[56px] lg:leading-[1.1]"
          >
            What is AI Sovereignty?
          </h1>
          <p className="mt-6 text-lg text-white/60 leading-relaxed sm:text-xl max-w-2xl">
            AI Sovereignty measures how much control an organization truly has over its AI
            capabilities, infrastructure, data, continuity, and operational independence.
          </p>
          <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row">
            <a
              href="/assurance/intelligence-risk"
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-2xl bg-cyan-300/90 px-7 py-3.5 text-sm font-semibold text-[#031018] transition-colors hover:bg-cyan-200"
            >
              Explore Soberanía Assurance
            </a>
            <a
              href="/assurance/intelligence-risk#map"
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-2xl border border-white/20 px-7 py-3.5 text-sm font-medium text-white/80 transition-colors hover:border-white/35 hover:text-white"
            >
              View Constitutional Matrix
            </a>
          </div>
        </div>
      </section>

      {/* ── Article body ──────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6">

        {/* Section 1 — Definition */}
        <section className="border-b border-white/8 py-16" aria-labelledby="definition-heading">
          <h2 id="definition-heading" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            AI Sovereignty Defined
          </h2>
          <div className="mt-6 space-y-5 text-base text-white/65 leading-relaxed">
            <p>
              AI Sovereignty is the ability of an organization to own, control, operate, move,
              replace, and preserve independence over the AI capabilities that power its business.
            </p>
            <p>
              Unlike AI Governance, which focuses on supervision, accountability, and oversight,
              AI Sovereignty focuses on control.
            </p>
            <p>The central question of AI Sovereignty is:</p>
            <blockquote className="border-l-2 border-sky-400/50 pl-5 text-white/80 italic font-medium not-italic">
              "Who truly controls the capability?"
            </blockquote>
          </div>

          <div className="mt-10 rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] px-6 py-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300/60 mb-3">
              Definition
            </p>
            <p className="text-base font-semibold text-white leading-snug">AI Sovereignty</p>
            <p className="mt-2 text-sm text-white/65 leading-relaxed">
              The degree to which an organization can control, operate, move, replace, and preserve
              independence over its AI capabilities.
            </p>
          </div>
        </section>

        {/* Section 2 — Why It Matters */}
        <section className="border-b border-white/8 py-16" aria-labelledby="why-heading">
          <h2 id="why-heading" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Why AI Sovereignty Matters
          </h2>
          <div className="mt-6 space-y-5 text-base text-white/65 leading-relaxed">
            <p>
              Organizations increasingly depend on AI providers for models, infrastructure,
              workflows, automation, decision support, and operational intelligence.
            </p>
            <p>That dependency can create hidden exposure.</p>
            <p>When AI Sovereignty is weak, organizations become vulnerable to:</p>
          </div>
          <ul className="mt-6 space-y-2.5" aria-label="Risks of weak AI Sovereignty">
            {[
              'Vendor lock-in',
              'Service discontinuation',
              'Model deprecation',
              'Pricing changes',
              'Data portability limitations',
              'Reduced operational autonomy',
              'Loss of continuity',
              'Difficulty replacing critical AI capabilities',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400/60" aria-hidden="true" />
                <span className="text-sm text-white/65">{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-base text-white/65 leading-relaxed">
            AI Sovereignty helps organizations understand and reduce those dependencies before
            they become strategic constraints.
          </p>
        </section>

        {/* Section 3 — Key Dimensions */}
        <section className="border-b border-white/8 py-16" aria-labelledby="dimensions-heading">
          <h2 id="dimensions-heading" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Key Dimensions of AI Sovereignty
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DimensionCard
              title="Infrastructure Control"
              description="Can the organization control where and how AI systems run?"
            />
            <DimensionCard
              title="Data Control"
              description="Can data be exported, retained, protected, and moved independently?"
            />
            <DimensionCard
              title="Model Optionality"
              description="Can AI providers, models, or model layers be replaced without major business disruption?"
            />
            <DimensionCard
              title="Portability"
              description="Can workflows, prompts, agents, data structures, and capabilities move across environments?"
            />
            <DimensionCard
              title="Continuity"
              description="Can operations continue if a provider changes terms, removes features, increases prices, or becomes unavailable?"
            />
            <DimensionCard
              title="Operational Independence"
              description="How dependent is the organization on external parties for critical AI functionality?"
            />
          </div>
        </section>

        {/* Section 4 — High vs Low */}
        <section className="border-b border-white/8 py-16" aria-labelledby="comparison-heading">
          <h2 id="comparison-heading" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Examples of High and Low AI Sovereignty
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* High */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400/70 mb-4">
                High AI Sovereignty
              </p>
              <ul className="space-y-2.5" aria-label="Characteristics of high AI Sovereignty">
                {[
                  'Open architectures',
                  'Exportable data',
                  'Model optionality',
                  'Self-hosting options',
                  'Provider independence',
                  'Clear exit paths',
                  'Strong continuity planning',
                  'Lower lock-in risk',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-1 text-emerald-400 text-xs" aria-hidden="true">✓</span>
                    <span className="text-sm text-white/65">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Low */}
            <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.03] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400/70 mb-4">
                Low AI Sovereignty
              </p>
              <ul className="space-y-2.5" aria-label="Characteristics of low AI Sovereignty">
                {[
                  'Closed ecosystems',
                  'Non-exportable data',
                  'Single-provider dependence',
                  'No migration path',
                  'Limited operational control',
                  'Weak continuity planning',
                  'High lock-in risk',
                  'Fragile capability ownership',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-1 text-orange-400/80 text-xs" aria-hidden="true">—</span>
                    <span className="text-sm text-white/65">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Section 5 — Sovereignty vs Governance */}
        <section className="border-b border-white/8 py-16" aria-labelledby="vs-heading">
          <h2 id="vs-heading" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            AI Sovereignty vs AI Governance
          </h2>
          <div className="mt-6 space-y-5 text-base text-white/65 leading-relaxed">
            <p>AI Governance and AI Sovereignty are complementary concepts.</p>
            <p>Governance measures supervision. Sovereignty measures control.</p>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.03] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300/60 mb-2">Governance asks</p>
              <p className="text-base font-medium text-white/85 italic">"Is the system properly managed?"</p>
            </div>
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.03] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300/60 mb-2">Sovereignty asks</p>
              <p className="text-base font-medium text-white/85 italic">"Who ultimately controls the capability?"</p>
            </div>
          </div>
          <div className="mt-8 space-y-5 text-base text-white/65 leading-relaxed">
            <p>
              An organization can have strong governance and weak sovereignty. It may have policies,
              controls, and oversight, while still depending entirely on a single provider.
            </p>
            <p>
              An organization can also have strong sovereignty and weak governance. It may control
              its infrastructure and models, but lack accountability, auditability, or operational
              boundaries.
            </p>
            <p className="text-white/80 font-medium">Trust requires both.</p>
          </div>
          <div className="mt-8">
            <a
              href="/ai-governance-vs-ai-sovereignty"
              className="inline-flex items-center gap-2 text-sm font-medium text-sky-300 hover:text-sky-200 transition-colors"
            >
              Read AI Governance vs AI Sovereignty →
            </a>
          </div>
        </section>

        {/* Section 6 — Vendor Lock-in */}
        <section className="border-b border-white/8 py-16" aria-labelledby="lockin-heading">
          <h2 id="lockin-heading" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            AI Sovereignty and Vendor Lock-in
          </h2>
          <div className="mt-6 space-y-5 text-base text-white/65 leading-relaxed">
            <p>
              Vendor lock-in is one of the most visible symptoms of weak AI Sovereignty.
            </p>
            <p>
              In traditional software, lock-in usually means difficulty moving data or replacing
              a platform.
            </p>
            <p>In AI systems, lock-in can be deeper. It can include:</p>
          </div>
          <ul className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2" aria-label="Forms of AI vendor lock-in">
            {[
              'Model dependency',
              'Agent dependency',
              'Workflow dependency',
              'Prompt dependency',
              'Memory dependency',
              'Integration dependency',
              'Evaluation dependency',
              'Human process dependency',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.015] px-4 py-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400/60" aria-hidden="true" />
                <span className="text-sm text-white/65">{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-base text-white/65 leading-relaxed">
            As AI systems become more autonomous, the cost of weak sovereignty may increase.
          </p>
        </section>

        {/* Section 7 — How Soberanía Measures */}
        <section className="border-b border-white/8 py-16" aria-labelledby="measuring-heading">
          <h2 id="measuring-heading" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            How Soberanía Measures AI Sovereignty
          </h2>
          <div className="mt-6 space-y-5 text-base text-white/65 leading-relaxed">
            <p>
              The Soberanía Constitutional Index evaluates AI Sovereignty using publicly observable
              evidence and assessment criteria across infrastructure control, portability,
              continuity, provider dependency, model flexibility, data control, and operational
              independence.
            </p>
            <p>The result is an AI Sovereignty Score that helps organizations understand their constitutional posture.</p>
            <p>The goal is not only to assign a score. The goal is to understand:</p>
          </div>
          <ul className="mt-6 space-y-2.5" aria-label="What the Sovereignty Score reveals">
            {[
              'where control exists',
              'where dependency exists',
              'where continuity risks emerge',
              'where portability is limited',
              'where autonomy can be improved',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400/60" aria-hidden="true" />
                <span className="text-sm text-white/65">{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <a
              href="/assurance/intelligence-risk"
              className="inline-flex items-center justify-center rounded-2xl bg-cyan-300/90 px-7 py-3.5 text-sm font-semibold text-[#031018] transition-colors hover:bg-cyan-200"
            >
              Explore Soberanía Assurance
            </a>
          </div>
        </section>

        {/* Section 8 — Constitutional Matrix */}
        <section className="border-b border-white/8 py-16" aria-labelledby="matrix-heading">
          <h2 id="matrix-heading" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            AI Sovereignty in the Constitutional Matrix
          </h2>
          <div className="mt-6 space-y-4 text-base text-white/65 leading-relaxed">
            <p>AI Sovereignty is one of the two dimensions of the Soberanía Constitutional Index.</p>
            <p>The other dimension is AI Governance.</p>
            <p>Together, they create four constitutional positions:</p>
          </div>
          <ul className="mt-8 space-y-4" aria-label="Constitutional positions">
            {[
              { label: 'Constitutional Leaders', desc: 'High Governance + High Sovereignty', color: '#34d399', textClass: 'text-emerald-300', borderClass: 'border-emerald-500/20', bgClass: 'bg-emerald-500/[0.04]' },
              { label: 'Trusted Custodians',    desc: 'High Governance + Low Sovereignty',  color: '#818cf8', textClass: 'text-indigo-300',  borderClass: 'border-indigo-500/20',  bgClass: 'bg-indigo-500/[0.04]'  },
              { label: 'Sovereignty Pioneers',  desc: 'Low Governance + High Sovereignty',  color: '#38bdf8', textClass: 'text-sky-300',     borderClass: 'border-sky-500/20',     bgClass: 'bg-sky-500/[0.04]'     },
              { label: 'Dependency Platforms',  desc: 'Low Governance + Low Sovereignty',   color: '#fb923c', textClass: 'text-orange-300',  borderClass: 'border-orange-500/20',  bgClass: 'bg-orange-500/[0.04]'  },
            ].map(({ label, desc, color, textClass, borderClass, bgClass }) => (
              <li key={label} className={`flex items-center gap-4 rounded-2xl border ${borderClass} ${bgClass} px-5 py-4`}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <div>
                  <span className={`text-sm font-semibold ${textClass}`}>{label}</span>
                  <span className="ml-2 text-sm text-white/40">{desc}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <a
              href="/assurance/intelligence-risk#map"
              className="inline-flex items-center justify-center rounded-2xl border border-white/20 px-7 py-3.5 text-sm font-medium text-white/80 transition-colors hover:border-white/35 hover:text-white"
            >
              View the Constitutional Matrix
            </a>
          </div>
        </section>

        {/* Section 9 — FAQ */}
        <section className="py-16" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Frequently Asked Questions
          </h2>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] px-5 sm:px-7" role="list" aria-label="Frequently asked questions about AI Sovereignty">
            {FAQS.map((faq, i) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} index={i} />
            ))}
          </div>
        </section>

      </div>{/* /article body */}

      {/* ── Bottom CTA ────────────────────────────────────────────────────── */}
      <section
        className="border-t border-white/8 px-4 py-20 sm:px-6"
        aria-labelledby="cta-heading"
      >
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="cta-heading" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            Understand the constitutional posture of your AI systems.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/55 leading-relaxed">
            The Soberanía Constitutional Index evaluates AI Sovereignty and Governance to reveal where
            control exists, where dependency exists, and where trust can be strengthened.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href="/assurance/intelligence-risk"
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-2xl bg-cyan-300/90 px-7 py-3.5 text-sm font-semibold text-[#031018] transition-colors hover:bg-cyan-200"
            >
              Explore Soberanía Assurance
            </a>
            <a
              href="/assurance/intelligence-risk#index"
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-2xl border border-white/20 px-7 py-3.5 text-sm font-medium text-white/80 transition-colors hover:border-white/35 hover:text-white"
            >
              View Constitutional Index
            </a>
          </div>
        </div>
      </section>

      <PageFooter />
    </main>
  );
}
