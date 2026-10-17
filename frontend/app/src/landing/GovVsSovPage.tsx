import { useEffect, useState } from 'react';
import { LogoRotating } from '../components/logo/LogoRotating';
import { SOBERANIA_OG_IMAGE_URL, SOBERANIA_PROTOCOL_URL } from './brand';
import './assurance.css';

const PAGE_URL = `${SOBERANIA_PROTOCOL_URL}/ai-governance-vs-ai-sovereignty`;
const FOUNDER_ESSAY_URL =
  'https://www.linkedin.com/pulse/i-started-looking-sovereignty-found-constitutional-valverde-checa-hnpye/';

// ── Per-page metadata injection ──────────────────────────────────────────────

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

    document.title = 'AI Governance vs AI Sovereignty | Soberanía Assurance';

    setMeta('description', 'AI Governance defines how AI systems are supervised, controlled, and made accountable. AI Sovereignty defines who controls, owns, moves, replaces, and operates the underlying AI capability.');
    setMeta('keywords', 'AI Governance vs AI Sovereignty, What is AI Sovereignty, What is AI Governance, AI Governance Score, AI Sovereignty Score, AI Trust Assessment, AI Constitutional Assessment, Constitutional AI Operations, Soberanía Assurance, Soberanía Constitutional Index');
    setMeta('robots', 'index, follow');

    const { el: canonicalEl, prevHref: prevCanonical } = setLink('canonical', PAGE_URL);

    setMeta('og:title', 'AI Governance vs AI Sovereignty | Soberanía Assurance', true);
    setMeta('og:description', 'Governance explains how AI is supervised. Sovereignty explains who truly controls the capability. Trust requires both.', true);
    setMeta('og:url', PAGE_URL, true);
    setMeta('og:type', 'article', true);
    setMeta('og:image', SOBERANIA_OG_IMAGE_URL, true);
    setMeta('og:site_name', 'Soberanía Assurance', true);

    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', 'AI Governance vs AI Sovereignty | Soberanía Assurance');
    setMeta('twitter:description', 'Governance explains how AI is supervised. Sovereignty explains who truly controls the capability. Trust requires both.');
    setMeta('twitter:site', '@archofchange');

    const jsonLd = document.createElement('script');
    jsonLd.type = 'application/ld+json';
    jsonLd.id = 'gov-sov-jsonld';
    jsonLd.text = JSON.stringify(buildJsonLd());
    document.head.appendChild(jsonLd);

    return () => {
      document.title = prevTitle;
      const injected = document.getElementById('gov-sov-jsonld');
      if (injected) injected.remove();
      if (prevCanonical !== null) canonicalEl.setAttribute('href', prevCanonical);
    };
  }, []);
}

function buildJsonLd() {
  const faqs = [
    {
      q: 'What is AI Governance?',
      a: 'AI Governance refers to the policies, controls, oversight mechanisms, accountability structures, documentation, and operational processes used to supervise AI systems. It answers: is the AI system properly supervised?',
    },
    {
      q: 'What is AI Sovereignty?',
      a: 'AI Sovereignty refers to the degree of control an organization has over the AI capability itself — including infrastructure, data, models, portability, continuity, replaceability, and provider dependency. It answers: who truly controls this AI capability?',
    },
    {
      q: 'Why does AI Sovereignty matter?',
      a: 'Sovereignty matters because an organization can have strong governance policies while still depending entirely on a provider for model access, infrastructure, data movement, and system continuity. That dependency creates risk that governance alone cannot address.',
    },
    {
      q: 'Can an AI system have strong governance but weak sovereignty?',
      a: 'Yes. This is the "Trusted Custodian" position in the Soberanía Constitutional Matrix. Strong oversight exists, but the organization retains limited control over the underlying AI capability, creating dependency risk.',
    },
    {
      q: 'Can an AI system have strong sovereignty but weak governance?',
      a: 'Yes. This is the "Sovereignty Pioneer" position. The organization controls the infrastructure but lacks oversight, audit trails, accountability structures, and process maturity to govern it safely.',
    },
    {
      q: 'What is the Soberanía Constitutional Index?',
      a: 'The Soberanía Constitutional Index is a public evaluation framework developed by Soberanía Assurance that measures the Governance Score and Sovereignty Score of AI systems and positions them in the Constitutional Matrix across four quadrants.',
    },
    {
      q: 'What is an AI Constitutional Assessment?',
      a: 'An AI Constitutional Assessment evaluates the structural balance between governance and sovereignty to understand the trust posture of an AI system. It produces a Governance Score, Sovereignty Score, and Constitutional Position.',
    },
    {
      q: 'How does Soberanía Assurance measure AI trust?',
      a: 'Soberanía Assurance evaluates public evidence, documentation, product architecture, policy disclosures, operational signals, and technical posture to estimate an organization\'s Governance Score and Sovereignty Score — producing a Constitutional Position in the Soberanía Constitutional Matrix.',
    },
  ];

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SOBERANIA_PROTOCOL_URL}/#organization`,
        name: 'Soberanía Assurance',
        alternateName: 'Soberanía Protocol',
        url: `${SOBERANIA_PROTOCOL_URL}/`,
        logo: { '@type': 'ImageObject', url: `${SOBERANIA_PROTOCOL_URL}/og-image.png` },
        founder: { '@type': 'Person', name: 'Victor Valverde', sameAs: 'https://www.linkedin.com/in/victorvalverde/' },
        sameAs: [
          'https://www.linkedin.com/company/architects-of-change-protocol/',
          'https://x.com/archofchange',
          'https://github.com/Architects-of-Change-Protocol/Architects_of_Change_Protocol',
        ],
      },
      {
        '@type': 'WebPage',
        '@id': `${PAGE_URL}#webpage`,
        url: PAGE_URL,
        name: 'AI Governance vs AI Sovereignty | Soberanía Assurance',
        description: 'AI Governance defines how AI systems are supervised, controlled, and made accountable. AI Sovereignty defines who controls, owns, moves, replaces, and operates the underlying AI capability.',
        isPartOf: { '@id': `${SOBERANIA_PROTOCOL_URL}/#website` },
        about: { '@id': `${SOBERANIA_PROTOCOL_URL}/#organization` },
        primaryImageOfPage: { '@type': 'ImageObject', url: `${SOBERANIA_PROTOCOL_URL}/og-image.png` },
        keywords: ['AI Governance vs AI Sovereignty', 'What is AI Sovereignty', 'What is AI Governance', 'AI Governance Score', 'AI Sovereignty Score', 'AI Trust Assessment', 'AI Constitutional Assessment', 'Constitutional AI Operations'],
        inLanguage: 'en-US',
        publisher: { '@id': `${SOBERANIA_PROTOCOL_URL}/#organization` },
      },
      {
        '@type': 'Article',
        '@id': `${PAGE_URL}#article`,
        headline: 'AI Governance vs AI Sovereignty',
        description: 'Governance explains how AI is supervised. Sovereignty explains who truly controls the capability. Trust requires both.',
        url: PAGE_URL,
        image: `${SOBERANIA_PROTOCOL_URL}/og-image.png`,
        author: { '@type': 'Person', name: 'Victor Valverde', sameAs: 'https://www.linkedin.com/in/victorvalverde/' },
        publisher: { '@id': `${SOBERANIA_PROTOCOL_URL}/#organization` },
        inLanguage: 'en-US',
        isPartOf: { '@id': `${PAGE_URL}#webpage` },
        about: [
          { '@type': 'Thing', name: 'AI Governance' },
          { '@type': 'Thing', name: 'AI Sovereignty' },
          { '@type': 'Thing', name: 'Soberanía Constitutional Index' },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${PAGE_URL}#faqpage`,
        mainEntity: faqs.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${PAGE_URL}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SOBERANIA_PROTOCOL_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Soberanía Assurance', item: `${SOBERANIA_PROTOCOL_URL}/assurance/intelligence-risk` },
          { '@type': 'ListItem', position: 3, name: 'AI Governance vs AI Sovereignty', item: PAGE_URL },
        ],
      },
      {
        '@type': 'Service',
        '@id': `${SOBERANIA_PROTOCOL_URL}/#service`,
        name: 'AI Governance and Sovereignty Assessment',
        serviceType: 'AI Governance Assessment',
        description: 'A constitutional assessment framework that evaluates AI systems across Governance and Sovereignty dimensions.',
        provider: { '@id': `${SOBERANIA_PROTOCOL_URL}/#organization` },
        url: `${SOBERANIA_PROTOCOL_URL}/assurance/intelligence-risk`,
      },
    ],
  };
}

// ── Simplified matrix visualization ─────────────────────────────────────────

function ConstitutionalMatrixSimple() {
  const quadrants = [
    {
      id: 'q2',
      label: 'Trusted Custodians',
      desc: 'High Governance · Low Sovereignty',
      gov: 'High',
      sov: 'Low',
      className: 'border-emerald-500/20 bg-emerald-500/5',
      labelColor: 'text-emerald-300',
    },
    {
      id: 'q1',
      label: 'Constitutional Leaders',
      desc: 'High Governance · High Sovereignty',
      gov: 'High',
      sov: 'High',
      className: 'border-cyan-400/30 bg-cyan-400/8',
      labelColor: 'text-cyan-300',
      highlight: true,
    },
    {
      id: 'q3',
      label: 'Dependency Platforms',
      desc: 'Low Governance · Low Sovereignty',
      gov: 'Low',
      sov: 'Low',
      className: 'border-white/8 bg-white/[0.015]',
      labelColor: 'text-white/50',
    },
    {
      id: 'q4',
      label: 'Sovereignty Pioneers',
      desc: 'Low Governance · High Sovereignty',
      gov: 'Low',
      sov: 'High',
      className: 'border-amber-400/20 bg-amber-400/5',
      labelColor: 'text-amber-300',
    },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto" role="img" aria-label="Soberanía Constitutional Matrix — four quadrants of AI Governance vs Sovereignty">
      {/* Axis labels */}
      <div className="flex items-end justify-between mb-2 px-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">← Low Sovereignty · High Sovereignty →</span>
      </div>
      <div className="relative">
        {/* Y-axis label */}
        <div className="absolute -left-8 top-1/2 -translate-y-1/2 -rotate-90">
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/35 whitespace-nowrap">Governance</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {/* Top row: high governance */}
          {quadrants.slice(0, 2).map((q) => (
            <div
              key={q.id}
              className={`rounded-xl border p-4 sm:p-5 ${q.className} ${q.highlight ? 'ring-1 ring-cyan-400/20' : ''}`}
            >
              <p className={`text-xs font-bold uppercase tracking-[0.16em] mb-1 ${q.labelColor}`}>{q.label}</p>
              <p className="text-xs text-white/45 leading-snug">{q.desc}</p>
              {q.highlight && (
                <p className="mt-2 text-[10px] text-cyan-300/70 font-medium">Strong oversight + strong control</p>
              )}
            </div>
          ))}
          {/* Bottom row: low governance */}
          {quadrants.slice(2, 4).map((q) => (
            <div
              key={q.id}
              className={`rounded-xl border p-4 sm:p-5 ${q.className}`}
            >
              <p className={`text-xs font-bold uppercase tracking-[0.16em] mb-1 ${q.labelColor}`}>{q.label}</p>
              <p className="text-xs text-white/45 leading-snug">{q.desc}</p>
            </div>
          ))}
        </div>
        {/* Axis labels overlay */}
        <div className="flex justify-between mt-2 px-1">
          <span className="text-[10px] text-white/25">Low →</span>
          <span className="text-[10px] text-white/25 text-right">← High</span>
        </div>
      </div>
    </div>
  );
}

// ── Comparison table ─────────────────────────────────────────────────────────

const TABLE_ROWS: { label: string; gov: string; sov: string }[] = [
  {
    label: 'Definition',
    gov: 'The ability to supervise, control, document, and hold AI systems accountable.',
    sov: 'The ability to own, operate, move, replace, and preserve control over AI capabilities.',
  },
  {
    label: 'Core question',
    gov: 'Is the system governed responsibly?',
    sov: 'Who controls the capability?',
  },
  {
    label: 'Main concern',
    gov: 'Risk, oversight, accountability, compliance, process maturity.',
    sov: 'Dependency, portability, autonomy, continuity, operational control.',
  },
  {
    label: 'Typical evidence',
    gov: 'Policies, audit logs, approval flows, risk reviews, documentation, escalation paths.',
    sov: 'Deployment control, data residency, model optionality, exportability, self-hosting, provider exit paths.',
  },
  {
    label: 'Risk when weak',
    gov: 'Uncontrolled behavior, lack of accountability, regulatory exposure, operational chaos.',
    sov: 'Vendor lock-in, dependency risk, reduced autonomy, loss of continuity.',
  },
  {
    label: 'Soberanía score',
    gov: 'Governance Score',
    sov: 'Sovereignty Score',
  },
];

function ComparisonTable() {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full min-w-[560px] text-sm" role="table" aria-label="AI Governance vs AI Sovereignty comparison">
        <thead>
          <tr role="row">
            <th
              scope="col"
              role="columnheader"
              className="text-left py-3 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35 w-[22%]"
            />
            <th
              scope="col"
              role="columnheader"
              className="text-left py-3 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400 w-[39%]"
            >
              AI Governance
            </th>
            <th
              scope="col"
              role="columnheader"
              className="text-left py-3 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300 w-[39%]"
            >
              AI Sovereignty
            </th>
          </tr>
        </thead>
        <tbody>
          {TABLE_ROWS.map((row, i) => (
            <tr
              key={row.label}
              role="row"
              className={`border-t ${i === 0 ? 'border-white/10' : 'border-white/[0.06]'}`}
            >
              <td className="py-4 px-4 text-xs font-semibold text-white/40 uppercase tracking-[0.14em] align-top">
                {row.label}
              </td>
              <td className="py-4 px-4 text-sm text-white/70 leading-relaxed align-top">
                {row.gov}
              </td>
              <td className="py-4 px-4 text-sm text-white/70 leading-relaxed align-top">
                {row.sov}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── FAQ section ──────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: 'What is AI Governance?',
    a: 'AI Governance refers to the policies, controls, oversight mechanisms, accountability structures, documentation, and operational processes used to supervise AI systems. It answers: is the AI system properly supervised?',
  },
  {
    q: 'What is AI Sovereignty?',
    a: 'AI Sovereignty refers to the degree of control an organization has over the AI capability itself — including infrastructure, data, models, portability, continuity, replaceability, and provider dependency. It answers: who truly controls this AI capability?',
  },
  {
    q: 'Why does AI Sovereignty matter?',
    a: 'Sovereignty matters because an organization can have strong governance policies while still depending entirely on a provider for model access, infrastructure, data movement, and system continuity. That dependency creates risk that governance alone cannot address.',
  },
  {
    q: 'Can an AI system have strong governance but weak sovereignty?',
    a: 'Yes. This is the Trusted Custodian position in the Soberanía Constitutional Matrix — strong oversight, but limited autonomy. The organization has controls in place but remains dependent on external providers for the underlying capability.',
  },
  {
    q: 'Can an AI system have strong sovereignty but weak governance?',
    a: 'Yes. This is the Sovereignty Pioneer position. The organization controls the infrastructure and capability, but lacks the oversight, audit trails, accountability structures, and process maturity needed to govern it safely.',
  },
  {
    q: 'What is the Soberanía Constitutional Index?',
    a: 'The Soberanía Constitutional Index is a public evaluation framework developed by Soberanía Assurance that measures the Governance Score and Sovereignty Score of AI systems, positioning them in the Constitutional Matrix across four quadrants: Constitutional Leaders, Trusted Custodians, Sovereignty Pioneers, and Dependency Platforms.',
  },
  {
    q: 'What is an AI Constitutional Assessment?',
    a: 'An AI Constitutional Assessment evaluates the structural balance between governance and sovereignty to understand the trust posture of an AI system. It produces a Governance Score, Sovereignty Score, and Constitutional Position within the Soberanía Constitutional Matrix.',
  },
  {
    q: 'How does Soberanía Assurance measure AI trust?',
    a: 'Soberanía Assurance evaluates public evidence, documentation, product architecture, policy disclosures, operational signals, and technical posture to estimate an organization\'s Governance Score and Sovereignty Score — producing a Constitutional Position that identifies trust posture, dependency risk, and improvement priorities.',
  },
];

function FaqItem({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/[0.07]">
      <button
        type="button"
        className="w-full flex items-start justify-between gap-4 py-5 text-left group"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-sm font-medium text-white/85 group-hover:text-white transition-colors leading-snug">{q}</span>
        <span className={`mt-0.5 shrink-0 text-white/40 transition-transform duration-200 ${open ? 'rotate-45' : ''}`} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      {open && (
        <p className="pb-5 text-sm text-white/55 leading-relaxed">{a}</p>
      )}
    </div>
  );
}

// ── Nav ──────────────────────────────────────────────────────────────────────

function GovSovNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <nav className="sticky top-0 z-30 backdrop-blur bg-[#070d0b]/80 border-b border-white/10">
      <div className="max-w-7xl mx-auto h-16 px-6 flex items-center justify-between">
        <a href="/assurance/intelligence-risk" className="flex items-center gap-3">
          <LogoRotating size={28} inverted />
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold tracking-tighter">Soberanía</span>
            <span className="text-xs text-emerald-400 uppercase tracking-[0.2em]">Assurance</span>
          </div>
        </a>

        <div className="hidden md:flex items-center gap-7 text-sm font-medium text-white/70">
          <a href="/assurance/intelligence-risk#map" className="hover:text-white transition-colors">Constitutional Map</a>
          <a href="/assurance/intelligence-risk#index" className="hover:text-white transition-colors">Index</a>
          <a href="/assurance/methodology" className="hover:text-white transition-colors">Methodology</a>
          <a href="/" className="hover:text-white transition-colors">Protocol</a>
        </div>

        <a
          href="/assurance/intelligence-risk#assessments"
          className="hidden md:inline-block px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold rounded-xl transition-colors"
        >
          Request Assessment
        </a>

        <button
          type="button"
          className="relative flex md:hidden h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-white transition-colors hover:border-white/30 hover:bg-white/5"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className={`absolute h-0.5 w-5 bg-current transition-transform duration-300 ${menuOpen ? 'rotate-45' : '-translate-y-1.5'}`} />
          <span className={`absolute h-0.5 w-5 bg-current transition-opacity duration-300 ${menuOpen ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`absolute h-0.5 w-5 bg-current transition-transform duration-300 ${menuOpen ? '-rotate-45' : 'translate-y-1.5'}`} />
        </button>
      </div>

      <div
        aria-hidden={!menuOpen}
        className={`absolute left-0 right-0 top-full overflow-hidden border-b border-white/10 bg-[#070d0b]/95 backdrop-blur-lg transition-[max-height,opacity] duration-300 ease-out md:hidden ${menuOpen ? 'max-h-72 opacity-100' : 'pointer-events-none max-h-0 opacity-0'}`}
      >
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col gap-1">
          {[
            { label: 'Constitutional Map', href: '/assurance/intelligence-risk#map' },
            { label: 'Index', href: '/assurance/intelligence-risk#index' },
            { label: 'Methodology', href: '/assurance/methodology' },
            { label: 'Soberanía Protocol', href: '/' },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="rounded-xl px-4 py-3 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white"
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}

// ── Page footer ──────────────────────────────────────────────────────────────

function GovSovFooter() {
  const footerGroups = [
    {
      title: 'Assessments',
      links: [
        { label: 'Request Assessment', href: '/assurance/intelligence-risk#assessments' },
        { label: 'Constitutional Index', href: '/assurance/intelligence-risk#index' },
        { label: 'Constitutional Map', href: '/assurance/intelligence-risk#map' },
      ],
    },
    {
      title: 'Research',
      links: [
        { label: 'Constitutional Matrix', href: '/assurance/intelligence-risk#map' },
        { label: 'Methodology', href: '/assurance/methodology' },
        { label: 'Founder Essay', href: FOUNDER_ESSAY_URL, external: true },
        { label: 'Public Research', href: '/assurance/research' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About Soberanía Assurance', href: '/assurance/about' },
        { label: 'Soberanía Protocol', href: '/' },
        { label: 'Privacy Policy', href: '/assurance/privacy' },
        { label: 'Terms of Service', href: '/assurance/terms' },
      ],
    },
    {
      title: 'Connect',
      links: [
        { label: 'LinkedIn', href: 'https://www.linkedin.com/company/architects-of-change-protocol/', external: true },
        { label: 'X (@archofchange)', href: 'https://x.com/archofchange', external: true },
        { label: 'GitHub', href: 'https://github.com/Architects-of-Change-Protocol/Architects_of_Change_Protocol', external: true },
        { label: 'Contact Us', href: 'mailto:vicvalch@onchainfest.xyz' },
      ],
    },
  ];

  return (
    <footer className="assurance-footer px-6" aria-labelledby="gov-sov-footer-title">
      <div className="max-w-7xl mx-auto assurance-footer-inner">
        <div className="assurance-footer-brand">
          <h2 id="gov-sov-footer-title">Soberanía Assurance</h2>
          <p>A constitutional assessment framework developed by Soberanía Protocol.</p>
          <p className="assurance-footer-tagline">Measure Governance.<br />Measure Sovereignty.<br />Understand the Balance.</p>
          <p className="assurance-footer-institutional">Soberanía Assurance and Soberanía Protocol are initiatives of OnchainFest LLC.</p>
        </div>
        <nav className="assurance-footer-links" aria-label="Footer navigation">
          {footerGroups.map((group) => (
            <section key={group.title} aria-labelledby={`gs-footer-${group.title.toLowerCase()}`}>
              <h3 id={`gs-footer-${group.title.toLowerCase()}`}>{group.title}</h3>
              <ul>
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={'external' in link && link.external ? '_blank' : undefined}
                      rel={'external' in link && link.external ? 'noopener noreferrer' : undefined}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
        <div className="assurance-footer-legal">
          <p>© 2026 OnchainFest LLC. All rights reserved.</p>
          <p>Soberanía Assurance does not certify organizations as safe, secure, compliant, trustworthy, or risk-free.</p>
          <p>The Constitutional Index is an evidence-based assessment framework designed to evaluate governance and sovereignty characteristics using publicly observable and/or supplied evidence. Constitutional scores represent analytical assessments and should not be interpreted as guarantees, certifications, or endorsements.</p>
        </div>
      </div>
    </footer>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function GovVsSovPage() {
  usePageMeta();

  return (
    <main className="min-h-screen bg-[#070d0b] text-white font-sans">
      <GovSovNav />

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="max-w-7xl mx-auto px-6 pt-6 pb-0">
        <ol className="flex items-center gap-2 text-xs text-white/35" itemScope itemType="https://schema.org/BreadcrumbList">
          <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
            <a href="/" className="hover:text-white/60 transition-colors" itemProp="item">
              <span itemProp="name">Home</span>
            </a>
            <meta itemProp="position" content="1" />
          </li>
          <li aria-hidden="true">/</li>
          <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
            <a href="/assurance/intelligence-risk" className="hover:text-white/60 transition-colors" itemProp="item">
              <span itemProp="name">Soberanía Assurance</span>
            </a>
            <meta itemProp="position" content="2" />
          </li>
          <li aria-hidden="true">/</li>
          <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
            <span className="text-white/55" itemProp="name">AI Governance vs AI Sovereignty</span>
            <meta itemProp="position" content="3" />
          </li>
        </ol>
      </nav>

      {/* ── Hero ── */}
      <section className="assurance-hero-glow relative pt-20 pb-24 text-center px-6" aria-labelledby="hero-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400 mb-6">SOBERANÍA CONSTITUTIONAL INDEX</p>
        <h1
          id="hero-heading"
          className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.08] mb-6 max-w-4xl mx-auto"
        >
          AI Governance vs AI Sovereignty
        </h1>
        <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed mb-10">
          Governance explains how AI is supervised. Sovereignty explains who truly controls the capability. Trust requires both.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/assurance/intelligence-risk"
            className="inline-flex items-center justify-center px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold rounded-xl transition-colors w-full sm:w-auto"
          >
            Explore Soberanía Assurance
          </a>
          <a
            href={FOUNDER_ESSAY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-6 py-3 border border-white/20 hover:border-white/35 text-white/80 hover:text-white text-sm font-medium rounded-xl transition-colors w-full sm:w-auto"
          >
            Read the Founder Essay
          </a>
        </div>
      </section>

      {/* ── Section 1: Summary Answer ── */}
      <section className="max-w-4xl mx-auto px-6 py-16" aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="text-2xl sm:text-3xl font-bold tracking-tight mb-6">
          What is the difference between AI Governance and AI Sovereignty?
        </h2>
        <div className="space-y-5 text-base text-white/65 leading-relaxed">
          <p>
            <strong className="text-white/85 font-semibold">AI Governance</strong> refers to the policies, controls, oversight
            mechanisms, accountability structures, documentation, and operational processes used to supervise AI systems.
          </p>
          <p>
            <strong className="text-white/85 font-semibold">AI Sovereignty</strong> refers to the degree of control an organization
            has over the AI capability itself, including infrastructure, data, models, portability, continuity, replaceability, and
            provider dependency.
          </p>
          <p>The difference is simple:</p>
        </div>
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400 mb-2">Governance answers</p>
            <p className="text-lg font-semibold text-white/90 leading-snug">"Is this AI system properly supervised?"</p>
          </div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 mb-2">Sovereignty answers</p>
            <p className="text-lg font-semibold text-white/90 leading-snug">"Who truly controls this AI capability?"</p>
          </div>
        </div>
      </section>

      {/* ── Section 2: Comparison Table ── */}
      <section className="max-w-5xl mx-auto px-6 py-10" aria-labelledby="comparison-heading">
        <h2 id="comparison-heading" className="text-2xl sm:text-3xl font-bold tracking-tight mb-8">
          Governance vs Sovereignty at a glance
        </h2>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-6 overflow-hidden">
          <ComparisonTable />
        </div>
      </section>

      {/* ── Section 3: Why governance alone is not enough ── */}
      <section className="max-w-4xl mx-auto px-6 py-16" aria-labelledby="governance-alone-heading">
        <h2 id="governance-alone-heading" className="text-2xl sm:text-3xl font-bold tracking-tight mb-6">
          Why governance alone is not enough
        </h2>
        <div className="space-y-5 text-base text-white/65 leading-relaxed">
          <p>
            An organization can have strong AI governance and still remain constitutionally dependent.
          </p>
          <p>
            It may have policies, controls, and oversight, while still depending entirely on a provider for model access,
            infrastructure, data movement, system continuity, or capability replacement.
          </p>
          <p>That creates a blind spot:</p>
        </div>
        <div className="my-8 rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8 space-y-4">
          <p className="text-base sm:text-lg font-semibold text-white/85">
            Governance without sovereignty creates dependency.
          </p>
          <div className="h-px bg-white/8" />
          <p className="text-base sm:text-lg font-semibold text-white/85">
            Sovereignty without governance creates chaos.
          </p>
        </div>
        <div className="space-y-5 text-base text-white/65 leading-relaxed">
          <p>
            A self-hosted or highly autonomous AI system may offer control, but without governance it can become difficult
            to supervise, audit, constrain, or trust.
          </p>
          <p className="text-white/80 font-medium">
            Trust emerges when both exist in balance.
          </p>
        </div>
      </section>

      {/* ── Section 4: Constitutional Matrix ── */}
      <section className="max-w-5xl mx-auto px-6 py-16" aria-labelledby="matrix-heading">
        <header className="text-center mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400 mb-4">SOBERANÍA CONSTITUTIONAL INDEX</p>
          <h2 id="matrix-heading" className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
            The Soberanía Constitutional Matrix
          </h2>
          <p className="text-white/55 max-w-2xl mx-auto leading-relaxed">
            The Soberanía Constitutional Index evaluates AI systems across two dimensions: Governance and Sovereignty. This creates
            four constitutional positions.
          </p>
        </header>

        <ConstitutionalMatrixSimple />

        <div className="mt-8 grid sm:grid-cols-2 gap-4 text-sm text-white/60">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.03] p-5">
            <p className="font-semibold text-cyan-300 mb-1">Constitutional Leaders</p>
            <p>High Governance + High Sovereignty. Strong oversight and strong control. The target constitutional position.</p>
          </div>
          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] p-5">
            <p className="font-semibold text-emerald-300 mb-1">Trusted Custodians</p>
            <p>High Governance + Low Sovereignty. Strong oversight, but limited autonomy and potential provider dependency.</p>
          </div>
          <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.03] p-5">
            <p className="font-semibold text-amber-300 mb-1">Sovereignty Pioneers</p>
            <p>Low Governance + High Sovereignty. Strong autonomy, but weaker oversight and accountability structures.</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.01] p-5">
            <p className="font-semibold text-white/45 mb-1">Dependency Platforms</p>
            <p>Low Governance + Low Sovereignty. Limited oversight and limited control. Highest constitutional risk.</p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <a
            href="/assurance/intelligence-risk#map"
            className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
          >
            View the live Constitutional Map →
          </a>
        </div>
      </section>

      {/* ── Section 5: How Soberanía Assurance measures both ── */}
      <section className="max-w-4xl mx-auto px-6 py-16" aria-labelledby="measures-heading">
        <h2 id="measures-heading" className="text-2xl sm:text-3xl font-bold tracking-tight mb-6">
          How Soberanía Assurance measures Governance and Sovereignty
        </h2>
        <div className="space-y-5 text-base text-white/65 leading-relaxed">
          <p>
            Soberanía Assurance evaluates public evidence, documentation, product architecture, policy disclosures, operational
            signals, and technical posture to estimate an organization's Governance Score and Sovereignty Score.
          </p>
          <p>The goal is not only to produce a score.</p>
          <p>The goal is to understand:</p>
        </div>
        <ul className="mt-6 space-y-3 text-base text-white/65">
          {[
            'where the organization stands',
            'what limits its trust posture',
            'what risks emerge from imbalance',
            'what improvements would increase constitutional maturity',
          ].map((item) => (
            <li key={item} className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <a
            href="/assurance/intelligence-risk#assessments"
            className="inline-flex items-center justify-center px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold rounded-xl transition-colors"
          >
            Request a Constitutional Assessment
          </a>
          <a
            href="/assurance/intelligence-risk#index"
            className="inline-flex items-center justify-center px-6 py-3 border border-white/20 hover:border-white/35 text-white/80 hover:text-white text-sm font-medium rounded-xl transition-colors"
          >
            Explore the Constitutional Index
          </a>
        </div>
      </section>

      {/* ── Section 6: Founder Essay ── */}
      <section className="max-w-4xl mx-auto px-6 py-16" aria-labelledby="essay-heading">
        <h2 id="essay-heading" className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
          The origin of the Soberanía Constitutional Index
        </h2>
        <p className="text-base text-white/55 leading-relaxed mb-8">
          The idea behind the Soberanía Constitutional Index began while building HRKey, where the search for AI sovereignty revealed
          a deeper governance tension.
        </p>
        <a
          href={FOUNDER_ESSAY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-2xl border border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.03] transition-colors p-6 sm:p-8 group"
          aria-label="Read the founder essay: I Started Looking for Sovereignty. I Found a Constitutional Problem."
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400 mb-3">FOUNDER ESSAY</p>
          <h3 className="text-lg sm:text-xl font-semibold text-white/90 group-hover:text-white transition-colors leading-snug mb-3">
            I Started Looking for Sovereignty. I Found a Constitutional Problem.
          </h3>
          <p className="text-sm text-white/50 leading-relaxed mb-5">
            A founder essay by Victor Valverde on the origin of the Soberanía Constitutional Index and why the AI industry may be
            measuring only half of the constitutional equation.
          </p>
          <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-400 group-hover:text-emerald-300 transition-colors">
            Read the Founder Essay →
          </span>
        </a>
      </section>

      {/* ── Section 7: FAQ ── */}
      <section className="max-w-4xl mx-auto px-6 py-16" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl sm:text-3xl font-bold tracking-tight mb-8">
          Frequently asked questions
        </h2>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 sm:px-8">
          {FAQ_ITEMS.map((item, i) => (
            <FaqItem key={item.q} q={item.q} a={item.a} defaultOpen={i === 0} />
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="max-w-4xl mx-auto px-6 py-16 text-center" aria-labelledby="cta-heading">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 sm:p-14">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400 mb-4">SOBERANÍA CONSTITUTIONAL INDEX</p>
          <h2 id="cta-heading" className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
            Understand your constitutional position.
          </h2>
          <p className="text-white/55 max-w-xl mx-auto leading-relaxed mb-8">
            Soberanía Assurance produces a Governance Score, Sovereignty Score, and Constitutional Position for your organization.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="/assurance/intelligence-risk#assessments"
              className="inline-flex items-center justify-center px-7 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold rounded-xl transition-colors w-full sm:w-auto"
            >
              Explore Soberanía Assurance
            </a>
            <a
              href={FOUNDER_ESSAY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-7 py-3.5 border border-white/20 hover:border-white/35 text-white/80 hover:text-white text-sm font-medium rounded-xl transition-colors w-full sm:w-auto"
            >
              Read the Founder Essay
            </a>
          </div>
        </div>
      </section>

      <GovSovFooter />
    </main>
  );
}
