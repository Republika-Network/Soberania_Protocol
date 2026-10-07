import { useState } from 'react';
import { MINERALS } from '../enterprise/minerals';
import { FRONTERA_SYSTEMS_NAME, FRONTERA_SYSTEMS_URL } from '../brand';
import { SoberaniaMark } from './SoberaniaMark';

// Structurally identical to ../enterprise/Nav.tsx's EnterpriseNav (same
// sticky dark bar, same sizing, spacing and mobile-disclosure interaction) —
// Protocol doesn't need EnterpriseNav's grouped-dropdown items, so this is a
// flat-item sibling rather than a shared component, but the visual language
// and interaction model are the same nav every AOC surface uses. The one
// thing that differs is the Capability Mineral on the primary CTA: Amethyst
// here, Sapphire on Enterprise/Governed Access/Assurance.
// Frontera Systems is a separate public site, not an in-app view, so it is
// the one item that leaves this origin — desktop and mobile both render from
// this single list, so the `external` flag applies to each automatically.
const NAV_ITEMS: { label: string; href: string; external?: boolean }[] = [
  { label: 'Sovereign Sphere', href: '/#sovereign-sphere' },
  { label: 'Digital Assets', href: '/#digital-asset' },
  { label: 'Builders', href: '/#developers' },
  { label: FRONTERA_SYSTEMS_NAME, href: FRONTERA_SYSTEMS_URL, external: true },
  { label: 'About', href: '/?view=about' },
];

export function ProtocolNav() {
  const [open, setOpen] = useState(false);
  const m = MINERALS.amethyst;

  return (
    <nav className="sticky top-0 z-30 border-b border-white/10 bg-[#090b11]/85 backdrop-blur">
      <div className="max-w-[100rem] mx-auto px-6">
        <div className="flex h-16 items-center gap-3">
          <a href="/" className="flex items-center gap-3 shrink-0">
            <SoberaniaMark className="h-8 w-7" />
            <span className="font-semibold tracking-tight text-white">Soberanía Protocol</span>
          </a>

          <div className="hidden lg:flex flex-1 min-w-0 items-center gap-0.5 text-[13px] overflow-x-auto no-scrollbar">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noreferrer' : undefined}
                className="shrink-0 rounded-lg px-2 py-2 text-white/65 transition-colors hover:text-white hover:bg-white/5"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3 ml-auto lg:ml-0 shrink-0">
            <a
              href="/app"
              className={`hidden md:inline-flex items-center rounded-xl ${m.solid} px-4 py-2 text-sm font-semibold text-white ${m.solidHover} transition-colors whitespace-nowrap`}
            >
              Launch App
            </a>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="protocol-mobile-nav"
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
          <div id="protocol-mobile-nav" className="lg:hidden border-t border-white/10 py-3">
            <div className="flex flex-col gap-0.5">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noreferrer' : undefined}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-white/70 hover:bg-white/5 hover:text-white"
                >
                  {item.label}
                </a>
              ))}
              <a
                href="/app"
                onClick={() => setOpen(false)}
                className={`mt-2 inline-flex items-center justify-center rounded-xl ${m.solid} px-4 py-2.5 text-sm font-semibold text-white`}
              >
                Launch App
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
