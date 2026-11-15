import type { Mineral } from '../enterprise/primitives';
import { FRONTERA_SYSTEMS_NAME, FRONTERA_SYSTEMS_URL, REPOSITORY_URL } from '../brand';

type FooterItem = {
  label: string
  href?: string
  external?: boolean
}

// Which surface's navigation column to render. Only the first item differs:
// the Protocol surface points at the Frontera Systems site (the commercial
// layer's own public brand), every other surface keeps the in-app
// /?view=enterprise entry it renders today.
export type FooterSurface = 'default' | 'protocol'

const protocolLinks: FooterItem[] = [
  { label: 'Architecture' },
  { label: 'Digital Assets' },
  { label: 'Capability Model' },
  { label: 'Sovereignty' },
]

const sharedNavigationLinks: FooterItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'About', href: '/?view=about' },
  { label: 'Contact Us', href: '/?view=contact' },
  { label: 'GitHub', href: REPOSITORY_URL, external: true },
]

const NAVIGATION_LINKS: Record<FooterSurface, FooterItem[]> = {
  default: [{ label: 'Enterprise', href: '/?view=enterprise' }, ...sharedNavigationLinks],
  protocol: [
    { label: FRONTERA_SYSTEMS_NAME, href: FRONTERA_SYSTEMS_URL, external: true },
    ...sharedNavigationLinks,
  ],
}

// Every AOC surface renders the same footer component (shared layout,
// copy structure and interaction model) — only its Capability Mineral
// accent changes, per surface: Protocol -> Amethyst, Enterprise ->
// Sapphire, Governed Access -> Turquoise, Assurance -> Emerald. Amber
// (reserved for a future AI Governance surface) is defined for
// completeness even though nothing renders it yet.
const ACCENT_CLASSES: Record<Mineral, { divider: string }> = {
  amethyst: {
    divider: 'bg-violet-200/20',
  },
  sapphire: {
    divider: 'bg-indigo-300/20',
  },
  turquoise: {
    divider: 'bg-teal-200/20',
  },
  emerald: {
    divider: 'bg-emerald-200/20',
  },
  amber: {
    divider: 'bg-amber-200/20',
  },
} as const;

export function ProtocolFooter({
  accent = 'sapphire',
  surface = 'default',
}: { accent?: Mineral; surface?: FooterSurface }) {
  const tone = ACCENT_CLASSES[accent];
  const navigationLinks = NAVIGATION_LINKS[surface];
  return (
    <section className="border-t border-white/10 bg-[#050816]">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-6 pt-12 md:pt-16">
        <footer className="footer-fade rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.008))] px-4 sm:px-6 py-8 md:px-10 md:py-12">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            <div className="max-w-sm">
              <h3 className="text-base font-semibold tracking-tight text-white">Soberanía Protocol</h3>
              <div className={`mt-4 h-px w-16 ${tone.divider}`} />
              <p className="mt-4 text-sm leading-6 text-white/62">
                An open, provider-neutral protocol for digital assets — identity, integrity,
                provenance and capabilities that compatible systems can interpret.
              </p>
            </div>

            <FooterColumn title="Protocol" items={protocolLinks} />
            <FooterColumn title="Navigation" items={navigationLinks} />
          </div>

          <div className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-5 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Soberanía Protocol</p>
            <div className="flex items-center gap-5">
              <span className="text-white/35">Privacy</span>
              <span className="text-white/35">Terms</span>
            </div>
          </div>
        </footer>
      </div>

      <style>{`
        :root {
          --aoc-ease-premium: cubic-bezier(0.22, 1, 0.36, 1);
        }

        @keyframes footer-fade-up {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        .footer-fade {
          animation: footer-fade-up 560ms var(--aoc-ease-premium) both;
        }

        .footer-link-hover {
          transition:
            opacity 180ms var(--aoc-ease-premium),
            transform 180ms var(--aoc-ease-premium),
            border-color 180ms var(--aoc-ease-premium),
            color 180ms var(--aoc-ease-premium),
            background-color 180ms var(--aoc-ease-premium);
        }

        .footer-link-hover:hover {
          transform: translateY(-1px);
        }

        @media (prefers-reduced-motion: reduce) {
          .footer-fade,
          .footer-link-hover,
          .footer-link-hover:hover {
            animation: none !important;
            transform: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </section>
  )
}

function FooterColumn({ title, items }: { title: string; items: FooterItem[] }) {
  return (
    <div>
      <h3 className="text-sm font-medium uppercase tracking-[0.16em] text-white/62">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li key={item.label}>
            {item.href ? (
              <a href={item.href} target={item.external ? '_blank' : undefined} rel={item.external ? 'noreferrer' : undefined} className="footer-link-hover inline-block text-sm text-white/55 hover:text-white/80">
                {item.label}
              </a>
            ) : (
              <span className="inline-block text-sm text-white/38">{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
