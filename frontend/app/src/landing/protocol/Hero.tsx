import type { CSSProperties } from 'react';
import heroArt from '../../assets/soberania/soberania-hero-mirror.webp';
import assetsSpecimen from '../../assets/soberania/specimen-assets.webp';
import rightsSpecimen from '../../assets/soberania/specimen-rights.webp';
import consentSpecimen from '../../assets/soberania/specimen-consent.webp';
import claimsSpecimen from '../../assets/soberania/specimen-claims.webp';
import provenanceSpecimen from '../../assets/soberania/specimen-provenance.webp';
import { SphereIcon } from './SphereIcon';
import type { SphereElementId } from './sphereElements';
import './SoberaniaHome.css';

// The hero is a raster artwork (the human subject, the luminous boundary and
// the same person reflected as an amethyst digital representation) with every
// piece of text, CTA and annotation layered on top as real HTML. On desktop
// the whole composition is laid out on the approved mock's 1672px grid:
// coordinates below are mock pixels, scaled by --u (see SoberaniaHome.css).
type Annotation = {
  id: SphereElementId;
  label: string;
  /** Icon specimen box, top-left corner. */
  box?: [number, number];
  /** Photographic specimen: x, y, width, height. */
  thumb?: [number, number, number, number, string];
  /** Label text: left edge and vertical center. */
  at: [number, number];
  plus?: number;
  /** Right end of the hairline under the label. */
  rule: number;
};

const ANNOTATIONS: Annotation[] = [
  { id: 'identity', label: 'Identity', box: [1286, 102], at: [1359, 125], plus: 1449, rule: 1469 },
  { id: 'property', label: 'Property', box: [1401, 151], at: [1478, 172], plus: 1576, rule: 1592 },
  { id: 'assets', label: 'Assets', box: [1354, 230], thumb: [1530, 199, 67, 72, assetsSpecimen], at: [1430, 253], plus: 1501, rule: 1516 },
  { id: 'rights', label: 'Rights', box: [1413, 303], thumb: [1564, 284, 62, 56, rightsSpecimen], at: [1488, 326], plus: 1560, rule: 1562 },
  { id: 'consent', label: 'Consent', box: [1361, 381], thumb: [1546, 357, 49, 86, consentSpecimen], at: [1436, 405], plus: 1516, rule: 1531 },
  { id: 'claims', label: 'Claims', box: [1419, 454], thumb: [1563, 466, 67, 59, claimsSpecimen], at: [1494, 479], rule: 1556 },
  { id: 'provenance', label: 'Provenance', thumb: [1386, 529, 77, 57, provenanceSpecimen], at: [1478, 551], plus: 1585, rule: 1601 },
  { id: 'authority', label: 'Authority', box: [1423, 600], at: [1497, 623], plus: 1597, rule: 1613 },
];

const META = ['Identity', 'Property', 'Assets', 'Rights', 'Consent', 'Claims', 'Provenance', 'Authority'];

const pos = (vars: Record<string, number>) =>
  Object.fromEntries(Object.entries(vars).map(([k, v]) => [`--${k}`, v])) as CSSProperties;

export function Hero() {
  return (
    <section id="overview" className="sob-hero scroll-mt-16">
      <figure className="sob-hero__art">
        <img
          src={heroArt}
          alt="A traveller stands before a luminous digital boundary, facing their own reflection rendered in amethyst crystal and network light."
          fetchPriority="high"
        />
      </figure>

      <div className="sob-hero__copy">
        <p className="sob-eyebrow sob-hero__eyebrow">A more sovereign digital world</p>

        <h1 className="sob-hero__title">
          You are <em>sovereign.</em>
          <br />
          What is <em>yours</em> should be too.
        </h1>

        <p className="sob-hero__lede">
          Your identity, property, assets, rights and authority increasingly exist across digital
          systems. Soberanía Protocol defines the structures that let them preserve who they belong
          to, what they mean and how they may be governed.
        </p>

        <div className="sob-hero__ctas">
          <a href="#sovereign-sphere" className="sob-btn sob-btn--primary">
            Explore the protocol <span aria-hidden="true">→</span>
          </a>
          <a href="/?view=docs" className="sob-btn sob-btn--ghost">
            Read the docs
          </a>
        </div>

        <ul className="sob-hero__meta" aria-label="What the sovereign sphere includes">
          {META.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <div className="sob-hero__principle">
          <p className="sob-hero__principle-label">Sovereign by design</p>
          <p className="sob-hero__principle-text">
            The medium may change.
            <br />
            The owner, meaning and authority should not.
          </p>
        </div>
      </div>

      <ul className="sob-hero__annotations" aria-label="The digital reflection carries">
        {ANNOTATIONS.map((a) => (
          <li key={a.id} className="sob-annot">
            {a.box ? (
              <span className="sob-annot__box sob-specimen" style={pos({ x: a.box[0], y: a.box[1] })}>
                <SphereIcon id={a.id} className="sob-specimen__icon" />
              </span>
            ) : null}
            {a.thumb ? (
              <img
                src={a.thumb[4]}
                alt=""
                className={`sob-annot__thumb${a.box ? '' : ' sob-annot__thumb--lead'}`}
                style={pos({ x: a.thumb[0], y: a.thumb[1], w: a.thumb[2], h: a.thumb[3] })}
                loading="lazy"
              />
            ) : null}
            {!a.box ? (
              <span className="sob-annot__mobile-icon sob-specimen" aria-hidden="true">
                <SphereIcon id={a.id} className="sob-specimen__icon" />
              </span>
            ) : null}
            <span className="sob-annot__label" style={pos({ x: a.at[0], y: a.at[1] })}>
              {a.label}
            </span>
            {a.plus ? <span className="sob-annot__plus" aria-hidden="true" style={pos({ x: a.plus, y: a.at[1] })} /> : null}
            <span className="sob-annot__rule" aria-hidden="true" style={pos({ x: a.at[0], y: a.at[1], w: a.rule - a.at[0] })} />
          </li>
        ))}
      </ul>
    </section>
  );
}
