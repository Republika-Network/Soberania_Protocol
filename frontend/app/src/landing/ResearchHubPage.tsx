import { useEffect } from 'react';
import { LogoRotating } from '../components/logo/LogoRotating';
import { CONSTITUTIONAL_INDEX_ORGANIZATIONS } from './assuranceIndexData';
import { SOBERANIA_OG_IMAGE_URL, SOBERANIA_PROTOCOL_URL } from './brand';
import './assurance.css';

const PAGE_URL = `${SOBERANIA_PROTOCOL_URL}/research`;
const FOUNDER_ESSAY_URL =
  'https://www.linkedin.com/pulse/i-started-looking-sovereignty-found-constitutional-valverde-checa-hnpye/';

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

    document.title =
      'AI Governance, Sovereignty & Constitutional AI Research | Soberanía Assurance';

    setMeta(
      'description',
      'Research, public assessments, constitutional frameworks, governance analysis, and sovereignty benchmarks for AI systems and organizations.',
    );
    setMeta(
      'keywords',
      'AI Governance Research, AI Sovereignty Research, AI Constitutional Assessment, Constitutional AI, AI Governance Framework, AI Sovereignty Framework, AI Trust Assessment, Governance Score, Sovereignty Score, AI Constitutional Index, AI Risk Assessment, AI Governance Benchmark, Soberanía Assurance',
    );
    setMeta('robots', 'index, follow');

    const { el: canonicalEl, prevHref: prevCanonical } = setLink('canonical', PAGE_URL);

    setMeta('og:title', 'The Constitutional AI Research Hub | Soberanía Assurance', true);
    setMeta(
      'og:description',
      'Research, assessments, essays, and benchmarks exploring Governance, Sovereignty, and Constitutional AI.',
      true,
    );
    setMeta('og:url', PAGE_URL, true);
    setMeta('og:type', 'website', true);
    setMeta('og:image', SOBERANIA_OG_IMAGE_URL, true);
    setMeta('og:site_name', 'Soberanía Assurance', true);

    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', 'The Constitutional AI Research Hub | Soberanía Assurance');
    setMeta(
      'twitter:description',
      'Research, assessments, essays, and benchmarks exploring Governance, Sovereignty, and Constitutional AI.',
    );
    setMeta('twitter:site', '@archofchange');

    const jsonLd = document.createElement('script');
    jsonLd.type = 'application/ld+json';
    jsonLd.id = 'research-hub-jsonld';
    jsonLd.text = JSON.stringify(buildJsonLd());
    document.head.appendChild(jsonLd);

    return () => {
      document.title = prevTitle;
      const injected = document.getElementById('research-hub-jsonld');
      if (injected) injected.remove();
      if (prevCanonical !== null) canonicalEl.setAttribute('href', prevCanonical);
    };
  }, []);
}

function buildJsonLd() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'The Constitutional AI Research Hub | Soberanía Assurance',
      description:
        'Research, public assessments, constitutional frameworks, governance analysis, and sovereignty benchmarks for AI systems and organizations.',
      url: PAGE_URL,
      publisher: {
        '@type': 'Organization',
        name: 'Soberanía Assurance',
        url: SOBERANIA_PROTOCOL_URL,
        logo: {
          '@type': 'ImageObject',
          url: `${SOBERANIA_PROTOCOL_URL}/og-image.png`,
        },
      },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Soberanía Assurance', item: SOBERANIA_PROTOCOL_URL },
          { '@type': 'ListItem', position: 2, name: 'Research Hub', item: PAGE_URL },
        ],
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Soberanía Research Resources',
      description: 'Constitutional AI research, essays, and methodology resources from Soberanía Assurance.',
      url: PAGE_URL,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'I Started Looking for Sovereignty. I Found a Constitutional Problem.',
          url: FOUNDER_ESSAY_URL,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'AI Governance vs AI Sovereignty',
          url: `${SOBERANIA_PROTOCOL_URL}/ai-governance-vs-ai-sovereignty`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'Constitutional Index Methodology',
          url: `${SOBERANIA_PROTOCOL_URL}/assurance/methodology`,
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Public Constitutional Assessments',
      description: 'Independent constitutional assessments of AI organizations and platforms.',
      url: PAGE_URL,
      itemListElement: CONSTITUTIONAL_INDEX_ORGANIZATIONS.map((org, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `${org.name} Constitutional Assessment`,
        url: `${SOBERANIA_PROTOCOL_URL}/research/${org.slug}-assessment`,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Soberanía Assurance',
      url: SOBERANIA_PROTOCOL_URL,
      description:
        'Soberanía Assurance provides constitutional assessments of AI systems, evaluating Governance and Sovereignty to establish constitutional posture and trust.',
    },
  ];
}

// ── Quadrant helpers ──────────────────────────────────────────────────────────

const QUADRANT_META = {
  'constitutional-leaders': {
    label: 'Constitutional Leaders',
    color: '#34d399',
    textClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/20',
    bgClass: 'bg-emerald-500/5',
  },
  'trusted-custodians': {
    label: 'Trusted Custodians',
    color: '#818cf8',
    textClass: 'text-indigo-300',
    borderClass: 'border-indigo-500/20',
    bgClass: 'bg-indigo-500/5',
  },
  'dependency-platforms': {
    label: 'Dependency Platforms',
    color: '#fb923c',
    textClass: 'text-orange-300',
    borderClass: 'border-orange-500/20',
    bgClass: 'bg-orange-500/5',
  },
  'sovereignty-pioneers': {
    label: 'Sovereignty Pioneers',
    color: '#38bdf8',
    textClass: 'text-sky-300',
    borderClass: 'border-sky-500/20',
    bgClass: 'bg-sky-500/5',
  },
};

// ── Mini Constitutional Matrix ────────────────────────────────────────────────

function MiniMatrix() {
  const W = 560;
  const H = 400;
  const L = 52, R = 16, T = 16, B = 40;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const divX = L + plotW * 0.55;
  const divY = T + plotH * (1 - 0.55);

  const toX = (sov: number) => L + (sov / 100) * plotW;
  const toY = (gov: number) => T + (1 - gov / 100) * plotH;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      aria-label="Constitutional Matrix: four-quadrant chart plotting AI organizations by Governance and Sovereignty scores"
      role="img"
      className="w-full h-auto"
    >
      {/* Quadrant fills */}
      <rect x={L} y={T} width={divX - L} height={divY - T} fill="rgba(129,140,248,0.04)" />
      <rect x={divX} y={T} width={W - R - divX} height={divY - T} fill="rgba(52,211,153,0.04)" />
      <rect x={L} y={divY} width={divX - L} height={H - B - divY} fill="rgba(251,146,60,0.04)" />
      <rect x={divX} y={divY} width={W - R - divX} height={H - B - divY} fill="rgba(56,189,248,0.04)" />

      {/* Axes */}
      <line x1={L} y1={T} x2={L} y2={H - B} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />

      {/* Divider lines */}
      <line x1={divX} y1={T} x2={divX} y2={H - B} stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray="4 3" />
      <line x1={L} y1={divY} x2={W - R} y2={divY} stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray="4 3" />

      {/* Axis labels */}
      <text x={L + plotW / 2} y={H - 6} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={11} fontFamily="Inter, sans-serif">Sovereignty →</text>
      <text x={14} y={T + plotH / 2} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={11} fontFamily="Inter, sans-serif" transform={`rotate(-90, 14, ${T + plotH / 2})`}>Governance →</text>

      {/* Quadrant labels */}
      <text x={L + (divX - L) / 2} y={T + 18} textAnchor="middle" fill="rgba(129,140,248,0.65)" fontSize={10} fontFamily="Inter, sans-serif" fontWeight="500">Trusted Custodians</text>
      <text x={divX + (W - R - divX) / 2} y={T + 18} textAnchor="middle" fill="rgba(52,211,153,0.65)" fontSize={10} fontFamily="Inter, sans-serif" fontWeight="500">Constitutional Leaders</text>
      <text x={L + (divX - L) / 2} y={H - B - 8} textAnchor="middle" fill="rgba(251,146,60,0.65)" fontSize={10} fontFamily="Inter, sans-serif" fontWeight="500">Dependency Platforms</text>
      <text x={divX + (W - R - divX) / 2} y={H - B - 8} textAnchor="middle" fill="rgba(56,189,248,0.65)" fontSize={10} fontFamily="Inter, sans-serif" fontWeight="500">Sovereignty Pioneers</text>

      {/* Organization dots */}
      {CONSTITUTIONAL_INDEX_ORGANIZATIONS.map((org) => {
        const cx = toX(org.sovereigntyScore);
        const cy = toY(org.governanceScore);
        const meta = QUADRANT_META[org.quadrant];
        return (
          <g key={org.id}>
            <circle cx={cx} cy={cy} r={8} fill={meta.color} opacity={0.85} />
            <text x={cx} y={cy + 20} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={10} fontFamily="Inter, sans-serif">{org.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-white/50">{label}</span>
        <span className={`text-xs font-semibold ${colorClass}`}>{value}</span>
      </div>
      <div className="h-1 rounded-full bg-white/8 overflow-hidden">
        <div className={`h-full rounded-full ${colorClass.replace('text-', 'bg-')}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ── Assessment Card ───────────────────────────────────────────────────────────

function AssessmentCard({ org }: { org: typeof CONSTITUTIONAL_INDEX_ORGANIZATIONS[0] }) {
  const meta = QUADRANT_META[org.quadrant];
  return (
    <article
      className={`rounded-2xl border ${meta.borderClass} ${meta.bgClass} p-6 flex flex-col gap-4 hover:border-white/20 transition-colors`}
      aria-label={`${org.name} Constitutional Assessment`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">{org.name}</h3>
          <p className="text-xs text-white/45 mt-0.5">{org.assessmentNumber}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.borderClass} ${meta.textClass}`}>
          Available
        </span>
      </div>

      <div className="space-y-2.5">
        <ScoreBar label="Governance Score" value={org.governanceScore} colorClass="text-indigo-300" />
        <ScoreBar label="Sovereignty Score" value={org.sovereigntyScore} colorClass="text-sky-300" />
      </div>

      <div className={`rounded-xl border ${meta.borderClass} px-3 py-2`}>
        <p className="text-[11px] text-white/40 uppercase tracking-wide mb-0.5">Constitutional Position</p>
        <p className={`text-sm font-medium ${meta.textClass}`}>{meta.label}</p>
      </div>

      <p className="text-xs text-white/55 leading-relaxed">{org.constitutionalSummary}</p>

      <a
        href={`/research/${org.slug}-assessment`}
        className="mt-auto inline-flex items-center justify-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white"
        aria-label={`View ${org.name} assessment`}
      >
        View Assessment →
      </a>
    </article>
  );
}

// ── Roadmap Card ──────────────────────────────────────────────────────────────

function RoadmapCard({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4 flex items-center justify-between gap-4">
      <span className="text-sm text-white/75 font-medium">{title}</span>
      <span className="shrink-0 rounded-full border border-cyan-500/25 bg-cyan-500/5 px-2.5 py-0.5 text-[10px] font-medium text-cyan-300/70 uppercase tracking-wide">
        In Progress
      </span>
    </div>
  );
}

// ── Core Concept Card ─────────────────────────────────────────────────────────

function ConceptCard({ title, href, placeholder }: { title: string; href?: string; placeholder?: boolean }) {
  const content = (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 flex flex-col gap-3 hover:border-white/20 transition-colors h-full">
      <span className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Core Concept</span>
      <h3 className="text-sm font-semibold text-white leading-snug">{title}</h3>
      <span className="mt-auto text-xs text-cyan-300/70">
        {placeholder ? 'Coming soon' : 'Read →'}
      </span>
    </div>
  );

  if (href && !placeholder) {
    return (
      <a href={href} className="block h-full" aria-label={title}>
        {content}
      </a>
    );
  }
  return <div className="h-full">{content}</div>;
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function ResearchNav() {
  return (
    <nav
      className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-white/8 bg-[#070d0b]/90 px-4 py-3 backdrop-blur-md sm:px-6"
      aria-label="Research Hub navigation"
    >
      <a href="/assurance/intelligence-risk" className="flex items-center gap-2.5" aria-label="Back to Soberanía Assurance">
        <LogoRotating size={26} inverted />
        <span className="text-sm font-semibold text-white/90">Soberanía Assurance</span>
      </a>
      <div className="flex items-center gap-4">
        <a href="#assessments" className="hidden sm:inline text-xs text-white/50 hover:text-white/80 transition-colors">Assessments</a>
        <a href="#concepts" className="hidden sm:inline text-xs text-white/50 hover:text-white/80 transition-colors">Concepts</a>
        <a href="#methodology" className="hidden sm:inline text-xs text-white/50 hover:text-white/80 transition-colors">Methodology</a>
        <a
          href="/assurance/methodology"
          className="rounded-xl border border-white/15 px-3.5 py-1.5 text-xs font-medium text-white/75 transition-colors hover:border-white/30 hover:text-white"
        >
          View Methodology
        </a>
      </div>
    </nav>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function ResearchFooter() {
  return (
    <footer className="border-t border-white/8 bg-[#050d0a] px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          <div>
            <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">Research</h4>
            <ul className="mt-4 space-y-2.5">
              {[
                { label: 'Founder Essay', href: FOUNDER_ESSAY_URL, external: true },
                { label: 'AI Governance vs Sovereignty', href: '/ai-governance-vs-ai-sovereignty' },
                { label: 'Methodology', href: '/assurance/methodology' },
                { label: 'Public Research Initiative', href: '/assurance/research' },
              ].map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    target={l.external ? '_blank' : undefined}
                    rel={l.external ? 'noreferrer' : undefined}
                    className="text-sm text-white/50 hover:text-white/80 transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">Assessments</h4>
            <ul className="mt-4 space-y-2.5">
              {CONSTITUTIONAL_INDEX_ORGANIZATIONS.map((org) => (
                <li key={org.id}>
                  <a
                    href={`/research/${org.slug}-assessment`}
                    className="text-sm text-white/50 hover:text-white/80 transition-colors"
                  >
                    {org.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">Soberanía Assurance</h4>
            <ul className="mt-4 space-y-2.5">
              {[
                { label: 'Constitutional Index', href: '/assurance/intelligence-risk' },
                { label: 'About', href: '/assurance/about' },
                { label: 'Contact', href: '/?view=contact' },
                { label: 'Privacy Policy', href: '/assurance/privacy' },
                { label: 'Terms of Service', href: '/assurance/terms' },
              ].map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm text-white/50 hover:text-white/80 transition-colors">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-white/8 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-white/30">© 2026 Soberanía Protocol / OnchainFest LLC</p>
          <p className="text-xs text-white/30">Soberanía Assurance Research Hub</p>
        </div>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ResearchHubPage() {
  usePageMeta();

  return (
    <main className="min-h-screen bg-[#070d0b] text-white font-sans antialiased" id="top">
      <ResearchNav />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden border-b border-white/8 px-4 pb-20 pt-20 sm:px-6 sm:pt-28 sm:pb-28"
        aria-labelledby="hero-heading"
      >
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <div className="h-[600px] w-[900px] rounded-full bg-cyan-500/[0.04] blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/70">
            SOBERANÍA RESEARCH
          </p>
          <h1
            id="hero-heading"
            className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl"
          >
            The Constitutional AI<br className="hidden sm:block" /> Research Hub
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60 leading-relaxed sm:text-xl">
            Research, assessments, essays, and benchmarks exploring Governance, Sovereignty,
            and the future of trustworthy AI systems.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href="#assessments"
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-2xl bg-cyan-300/90 px-7 py-3.5 text-sm font-semibold text-[#031018] transition-colors hover:bg-cyan-200"
            >
              Explore Public Assessments
            </a>
            <a
              href="/assurance/methodology"
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-2xl border border-white/20 px-7 py-3.5 text-sm font-medium text-white/80 transition-colors hover:border-white/35 hover:text-white"
            >
              View Methodology
            </a>
          </div>
        </div>
      </section>

      {/* ── Section 1: Why This Research Exists ───────────────────────────── */}
      <section
        className="border-b border-white/8 px-4 py-20 sm:px-6"
        aria-labelledby="why-heading"
      >
        <div className="mx-auto max-w-3xl">
          <h2
            id="why-heading"
            className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
          >
            Why This Research Exists
          </h2>
          <div className="mt-8 space-y-5 text-base text-white/65 leading-relaxed sm:text-lg">
            <p>
              The AI industry has developed extensive frameworks for governance, compliance, risk
              management, and oversight.
            </p>
            <p>
              At the same time, questions of sovereignty, operational control, portability,
              provider dependency, and continuity often receive far less attention.
            </p>
            <p>
              The Soberanía Research Hub exists to explore both dimensions and better understand the
              constitutional posture of AI systems.
            </p>
            <p>Our objective is not simply to measure risk.</p>
            <p className="text-white/85 font-medium">
              Our objective is to understand how Governance and Sovereignty interact to create trust.
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 2: Founder Essays ──────────────────────────────────────── */}
      <section
        className="border-b border-white/8 px-4 py-20 sm:px-6"
        aria-labelledby="essays-heading"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-10">
            <h2
              id="essays-heading"
              className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
            >
              Founder Essays
            </h2>
            <p className="mt-3 text-base text-white/50">Ideas that shaped the Soberanía Constitutional Index.</p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Essay 1 */}
            <article className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.03] p-6 flex flex-col gap-4 hover:border-cyan-500/30 transition-colors">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-300/60">
                Founder Essay · 2026
              </span>
              <h3 className="text-base font-semibold text-white leading-snug">
                I Started Looking for Sovereignty. I Found a Constitutional Problem.
              </h3>
              <p className="text-sm text-white/55 leading-relaxed">
                The origin story behind the Soberanía Constitutional Index and the discovery of the
                constitutional tension between Governance and Sovereignty.
              </p>
              <a
                href={FOUNDER_ESSAY_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
                aria-label="Read founder essay on LinkedIn"
              >
                Read Essay ↗
              </a>
            </article>

            {/* Future essay slots */}
            {[1, 2].map((n) => (
              <div
                key={n}
                className="rounded-2xl border border-white/6 bg-white/[0.01] p-6 flex flex-col gap-4"
                aria-label="Future essay — coming soon"
              >
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/20">
                  Coming Soon
                </span>
                <div className="h-4 w-3/4 rounded bg-white/6" />
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-white/4" />
                  <div className="h-3 w-5/6 rounded bg-white/4" />
                  <div className="h-3 w-4/6 rounded bg-white/4" />
                </div>
                <span className="mt-auto text-xs text-white/18">Essay in preparation</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 3: Public Assessments ─────────────────────────────────── */}
      <section
        id="assessments"
        className="border-b border-white/8 px-4 py-20 sm:px-6"
        aria-labelledby="assessments-heading"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-10">
            <h2
              id="assessments-heading"
              className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
            >
              Public Assessments
            </h2>
            <p className="mt-3 text-base text-white/50">
              Independent constitutional assessments of AI organizations and platforms.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CONSTITUTIONAL_INDEX_ORGANIZATIONS.map((org) => (
              <AssessmentCard key={org.id} org={org} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: Core Concepts ───────────────────────────────────────── */}
      <section
        id="concepts"
        className="border-b border-white/8 px-4 py-20 sm:px-6"
        aria-labelledby="concepts-heading"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-10">
            <h2
              id="concepts-heading"
              className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
            >
              Core Concepts
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <ConceptCard
              title="What is AI Sovereignty?"
              href="/what-is-ai-sovereignty"
            />
            <ConceptCard
              title="AI Governance vs AI Sovereignty"
              href="/ai-governance-vs-ai-sovereignty"
            />
            <ConceptCard
              title="What is an AI Constitutional Assessment?"
              placeholder
            />
            <ConceptCard
              title="How to Measure AI Trust"
              placeholder
            />
          </div>
        </div>
      </section>

      {/* ── Section 5: Constitutional Matrix ──────────────────────────────── */}
      <section
        className="border-b border-white/8 px-4 py-20 sm:px-6"
        aria-labelledby="matrix-heading"
      >
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <h2
                id="matrix-heading"
                className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
              >
                Constitutional Matrix
              </h2>
              <p className="mt-5 text-base text-white/60 leading-relaxed">
                The Soberanía Constitutional Index evaluates organizations across two dimensions:
                Governance and Sovereignty.
              </p>
              <p className="mt-4 text-base text-white/60 leading-relaxed">
                Together these dimensions create four constitutional positions:
              </p>
              <ul className="mt-6 space-y-3" aria-label="Constitutional positions">
                {(Object.entries(QUADRANT_META) as [string, typeof QUADRANT_META['constitutional-leaders']][]).map(([, meta]) => (
                  <li key={meta.label} className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                    <span className={`text-sm font-medium ${meta.textClass}`}>{meta.label}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <a
                  href="/assurance/intelligence-risk#map"
                  className="inline-flex items-center justify-center rounded-2xl border border-white/20 px-6 py-3 text-sm font-medium text-white/80 transition-colors hover:border-white/35 hover:text-white"
                >
                  Explore the Constitutional Matrix
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-6">
              <MiniMatrix />
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 6: Research Methodology ───────────────────────────────── */}
      <section
        id="methodology"
        className="border-b border-white/8 px-4 py-20 sm:px-6"
        aria-labelledby="methodology-heading"
      >
        <div className="mx-auto max-w-3xl">
          <h2
            id="methodology-heading"
            className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
          >
            Research Methodology
          </h2>
          <p className="mt-6 text-base text-white/65 leading-relaxed">
            Soberanía Assurance evaluates publicly observable evidence, technical architecture,
            operational disclosures, documentation, governance signals, portability indicators,
            and dependency characteristics.
          </p>
          <p className="mt-4 text-base text-white/65 leading-relaxed">
            Assessments are intended to establish constitutional posture, identify risk, and
            reveal opportunities for improvement.
          </p>
          <div className="mt-8">
            <a
              href="/assurance/methodology"
              className="inline-flex items-center justify-center rounded-2xl bg-cyan-300/90 px-7 py-3.5 text-sm font-semibold text-[#031018] transition-colors hover:bg-cyan-200"
            >
              View Methodology
            </a>
          </div>
        </div>
      </section>

      {/* ── Section 7: Upcoming Research ──────────────────────────────────── */}
      <section
        className="border-b border-white/8 px-4 py-20 sm:px-6"
        aria-labelledby="roadmap-heading"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-10">
            <h2
              id="roadmap-heading"
              className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
            >
              Upcoming Research
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              'AI Governance Benchmark Report',
              'State of AI Sovereignty',
              'Constitutional AI Operations Framework',
              'AI Trust Index',
              'Enterprise Sovereignty Benchmark',
            ].map((title) => (
              <RoadmapCard key={title} title={title} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 8: Join the Research Initiative ───────────────────────── */}
      <section
        className="px-4 py-24 sm:px-6"
        aria-labelledby="join-heading"
      >
        <div className="mx-auto max-w-3xl text-center">
          <h2
            id="join-heading"
            className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
          >
            Join the Research Initiative
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base text-white/60 leading-relaxed">
            The constitutional characteristics of AI systems will shape trust, resilience, and
            organizational autonomy for years to come.
          </p>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/60 leading-relaxed">
            We invite builders, operators, researchers, and organizations to participate in
            the conversation.
          </p>
          <div className="mt-10">
            <a
              href="/?view=contact"
              className="inline-flex items-center justify-center rounded-2xl bg-cyan-300/90 px-8 py-4 text-base font-semibold text-[#031018] transition-colors hover:bg-cyan-200"
            >
              Contact Soberanía Assurance
            </a>
          </div>
        </div>
      </section>

      <ResearchFooter />
    </main>
  );
}
