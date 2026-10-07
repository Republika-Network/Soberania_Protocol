import { useEffect, useState } from 'react';
import { FRONTERA_SYSTEMS_URL } from '../brand';
import { SoberaniaMark } from './SoberaniaMark';
import './SoberaniaHome.css';

// The Protocol homepage nav sits on the hero artwork: transparent and thin at
// the top of the page, settling into a dark bar once the reader scrolls.
// Frontera Systems is a separate public site, not an in-app view, so it is
// the one item that leaves this origin — desktop and mobile both render from
// this single list, so the `external` flag applies to each automatically.
const NAV_ITEMS: { label: string; href: string; external?: boolean }[] = [
  { label: 'Protocol', href: '/?view=about' },
  { label: 'Sovereign Sphere', href: '/#sovereign-sphere' },
  { label: 'Digital Assets', href: '/#digital-asset' },
  { label: 'For Builders', href: '/#developers' },
  { label: 'Frontera', href: FRONTERA_SYSTEMS_URL, external: true },
  { label: 'Docs', href: '/?view=docs' },
];

const CTA_HREF = '/#sovereign-sphere';

export function ProtocolNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className="sob-nav" data-scrolled={scrolled} aria-label="Soberanía Protocol">
      <div className="sob-nav__bar">
        <a href="/" className="sob-nav__brand">
          <SoberaniaMark className="sob-nav__mark" />
          <span className="sob-nav__wordmark">Soberanía Protocol</span>
        </a>

        <div className="sob-nav__links">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noreferrer' : undefined}
            >
              {item.label}
            </a>
          ))}
        </div>

        <a href={CTA_HREF} className="sob-btn sob-btn--navy sob-nav__cta">
          Explore the protocol <span aria-hidden="true">→</span>
        </a>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="protocol-mobile-nav"
          className="sob-nav__toggle"
        >
          <span className="sr-only">Toggle navigation</span>
          <span />
          <span />
          <span />
        </button>
      </div>

      {open ? (
        <div id="protocol-mobile-nav" className="sob-nav__drawer">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noreferrer' : undefined}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <a href="/app" onClick={() => setOpen(false)}>
            Launch app
          </a>
          <a href={CTA_HREF} onClick={() => setOpen(false)} className="sob-btn sob-btn--navy">
            Explore the protocol <span aria-hidden="true">→</span>
          </a>
        </div>
      ) : null}
    </nav>
  );
}
