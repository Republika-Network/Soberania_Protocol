// Shared breadcrumb trail used across Enterprise, Solutions, Services, and
// Developer pages so the Protocol -> Enterprise -> Solutions/Services
// hierarchy is visible on every page that sits below the top level, not
// just implied by the nav menu. Uses the same schema.org BreadcrumbList
// microdata convention already established in GovVsSovPage.tsx.

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

// `tone="protocol"` is the documentation variant (SOB-PUBLIC-ALIGN-01E): it
// sits inside the docs page header, which supplies its own container, and
// uses AA-contrast text with visible keyboard focus. The default tone is
// unchanged for every existing caller.
const TONES = {
  default: {
    nav: 'max-w-7xl mx-auto px-6 pt-6 pb-0',
    list: 'text-white/35',
    link: 'hover:text-white/60 transition-colors',
    current: 'text-white/55',
  },
  protocol: {
    nav: '',
    list: 'text-slate-300',
    link: 'text-violet-100 underline decoration-violet-200/30 underline-offset-4 transition hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300',
    current: 'text-white',
  },
} as const;

export function Breadcrumbs({
  items,
  className = '',
  tone = 'default',
}: {
  items: BreadcrumbItem[];
  className?: string;
  tone?: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <nav aria-label="Breadcrumb" className={`${t.nav} ${className}`}>
      <ol className={`flex flex-wrap items-center gap-2 text-xs ${t.list}`} itemScope itemType="https://schema.org/BreadcrumbList">
        {items.map((item, index) => (
          <li key={item.label} className="flex items-center gap-2">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
              {item.href ? (
                <a href={item.href} className={t.link} itemProp="item">
                  <span itemProp="name">{item.label}</span>
                </a>
              ) : (
                <span className={t.current} itemProp="name" aria-current={tone === 'protocol' ? 'page' : undefined}>{item.label}</span>
              )}
              <meta itemProp="position" content={String(index + 1)} />
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
