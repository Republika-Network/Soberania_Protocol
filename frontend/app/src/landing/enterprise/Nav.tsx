import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogoRotating } from '../../components/logo/LogoRotating';
import { ENTERPRISE_NAV_ITEMS, isNavGroup, type NavEntry } from './content';
import { fronteraAssessmentHref } from '../fronteraCommercial';

function isActiveHref(href: string) {
  if (typeof window === 'undefined') return false;
  const target = new URL(href, window.location.origin);
  return target.pathname === window.location.pathname && target.search === window.location.search;
}

function isActiveEntry(entry: NavEntry): boolean {
  if (isNavGroup(entry)) return entry.children.some((child) => isActiveHref(child.href));
  return isActiveHref(entry.href);
}

function NavLink({ label, href }: { label: string; href: string }) {
  const active = isActiveHref(href);
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`shrink-0 rounded-lg px-2 py-2 transition-colors hover:text-white hover:bg-white/5 ${
        active ? 'text-white' : 'text-white/65'
      }`}
    >
      {label}
    </a>
  );
}

// Rendered via a portal into document.body, positioned with `fixed` coordinates
// computed from the trigger's bounding rect. The desktop nav row scrolls
// horizontally at cramped widths (`overflow-x-auto`), and an ancestor with
// overflow-x set forces overflow-y to clip too — an absolutely-positioned
// dropdown nested inside that row would be invisible, clipped by the row
// itself. Portaling avoids that ancestor entirely.
function NavGroupDisclosure({ label, items }: { label: string; items: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const active = items.some((child) => isActiveHref(child.href));
  const panelId = `enterprise-nav-group-${label.toLowerCase().replace(/\s+/g, '-')}`;

  useEffect(() => {
    if (!open) return;

    const updateCoords = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setCoords({ top: rect.bottom + 4, left: rect.left });
    };
    updateCoords();

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);

    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-lg px-2 py-2 transition-colors hover:text-white hover:bg-white/5 ${
          active ? 'text-white' : 'text-white/65'
        }`}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1.5 3.5L5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="menu"
              aria-label={label}
              style={{ position: 'fixed', top: coords.top, left: coords.left }}
              className="z-40 min-w-[180px] rounded-xl border border-white/10 bg-[#0d0f16] py-1.5 shadow-lg"
            >
              {items.map((child) => (
                <a
                  key={child.label}
                  href={child.href}
                  role="menuitem"
                  aria-current={isActiveHref(child.href) ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={`block px-3.5 py-2 text-sm transition-colors hover:bg-white/5 hover:text-white ${
                    isActiveHref(child.href) ? 'text-white' : 'text-white/70'
                  }`}
                >
                  {child.label}
                </a>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function MobileNavEntry({ entry, onNavigate }: { entry: NavEntry; onNavigate: () => void }) {
  const [open, setOpen] = useState(() => isActiveEntry(entry));

  if (!isNavGroup(entry)) {
    return (
      <a
        href={entry.href}
        onClick={onNavigate}
        aria-current={isActiveHref(entry.href) ? 'page' : undefined}
        className={`rounded-lg px-3 py-2.5 hover:bg-white/5 hover:text-white ${isActiveHref(entry.href) ? 'text-white' : 'text-white/70'}`}
      >
        {entry.label}
      </a>
    );
  }

  const panelId = `enterprise-mobile-group-${entry.label.toLowerCase()}`;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-white/70 hover:bg-white/5 hover:text-white"
      >
        {entry.label}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1.5 3.5L5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div id={panelId} className="ml-3 flex flex-col border-l border-white/10 pl-3">
          {entry.children.map((child) => (
            <a
              key={child.label}
              href={child.href}
              onClick={onNavigate}
              aria-current={isActiveHref(child.href) ? 'page' : undefined}
              className={`rounded-lg px-3 py-2 text-sm hover:bg-white/5 hover:text-white ${
                isActiveHref(child.href) ? 'text-white' : 'text-white/60'
              }`}
            >
              {child.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function EnterpriseNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-30 border-b border-white/10 bg-[#090b11]/85 backdrop-blur">
      <div className="max-w-[100rem] mx-auto px-6">
        <div className="flex h-16 items-center gap-3">
          <a href="/" className="flex items-center gap-3 shrink-0">
            <LogoRotating size={26} inverted />
            <span className="font-semibold tracking-tight text-white">Soberanía Enterprise</span>
          </a>

          <div className="hidden lg:flex flex-1 min-w-0 items-center gap-0.5 text-[13px] overflow-x-auto no-scrollbar">
            {ENTERPRISE_NAV_ITEMS.map((entry) =>
              isNavGroup(entry) ? (
                <NavGroupDisclosure key={entry.label} label={entry.label} items={entry.children} />
              ) : (
                <NavLink key={entry.label} label={entry.label} href={entry.href} />
              )
            )}
          </div>

          <div className="flex items-center gap-3 ml-auto lg:ml-0 shrink-0">
            <a
              href={fronteraAssessmentHref('enterprise-nav')}
              className="hidden md:inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors whitespace-nowrap"
            >
              Frontera Technical Assessment
            </a>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="enterprise-mobile-nav"
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-white/70"
            >
              <span className="sr-only">Toggle navigation</span>
              <span className={`block h-px w-4 bg-current transition-transform ${open ? 'translate-y-0 rotate-45' : '-translate-y-1'}`} />
              <span className={`block h-px w-4 bg-current absolute transition-opacity ${open ? 'opacity-0' : 'opacity-100'}`} />
              <span className={`block h-px w-4 bg-current transition-transform ${open ? 'translate-y-0 -rotate-45' : 'translate-y-1'}`} />
            </button>
          </div>
        </div>

        {open ? (
          <div id="enterprise-mobile-nav" className="lg:hidden border-t border-white/10 py-3">
            <div className="flex flex-col gap-0.5">
              {ENTERPRISE_NAV_ITEMS.map((entry) => (
                <MobileNavEntry key={entry.label} entry={entry} onNavigate={() => setOpen(false)} />
              ))}
              <a
                href={fronteraAssessmentHref('enterprise-nav-mobile')}
                className="mt-2 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Frontera Technical Assessment
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
