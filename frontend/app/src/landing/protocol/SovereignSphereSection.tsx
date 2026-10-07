import type { CSSProperties } from 'react';
import landscape from '../../assets/soberania/soberania-sphere-landscape.webp';
import { SPHERE_ELEMENTS } from './sphereElements';
import { SphereIcon } from './SphereIcon';
import './SoberaniaHome.css';

// Desktop column widths, in mock pixels, from each divider to the next — the
// atlas row reads as a ruled collection rather than an even card grid.
const COLUMN_WIDTHS = [165, 195, 192, 189, 202, 182, 207, 182];

export function SovereignSphereSection() {
  return (
    <section id="sovereign-sphere" className="sob-sphere scroll-mt-16">
      <img src={landscape} alt="" className="sob-sphere__bg" loading="lazy" aria-hidden="true" />

      <div className="sob-sphere__inner">
        <div className="sob-sphere__head">
          <p className="sob-eyebrow sob-sphere__eyebrow">01 / The sovereign sphere</p>
          <h2 className="sob-sphere__title">
            More than a profile.
            <em>A sovereign sphere.</em>
          </h2>
        </div>

        <p className="sob-sphere__lede">
          Your digital presence includes your identity, property, assets, credentials, rights,
          consent, claims, provenance and authority. These elements should retain their meaning and
          remain under your governance — wherever they are.
        </p>

        <a href="#digital-asset" className="sob-btn sob-btn--navy sob-sphere__cta">
          Explore the protocol <span aria-hidden="true">→</span>
        </a>

        <ul className="sob-sphere__atlas">
          {SPHERE_ELEMENTS.map((item, i) => (
            <li key={item.id} className="sob-sphere__item" style={{ '--w': COLUMN_WIDTHS[i] } as CSSProperties}>
              <span className="sob-sphere__icon sob-specimen">
                <SphereIcon id={item.id} className="sob-specimen__icon" />
              </span>
              <h3 className="sob-sphere__name">{item.title}</h3>
              <p className="sob-sphere__caption">{item.copy}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
