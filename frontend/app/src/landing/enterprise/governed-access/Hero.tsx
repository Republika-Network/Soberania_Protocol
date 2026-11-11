import { LogoRotating } from '../../../components/logo/LogoRotating';
import { fronteraAssessmentHref } from '../../fronteraCommercial';

// SOBE-MKT-00: was a mailto to hello@aocprotocol.xyz (domain no longer resolves).
const CTA_HREF = fronteraAssessmentHref('governed-access-hero');

// Dark bookend, matching the visual rhythm of ../Hero.tsx (Enterprise) and
// ../CtaSection.tsx: light-primary page, dark hero + closing CTA. Copy is
// the product claim itself, not an explanation of Soberanía Enterprise as a
// platform — see docs/w006-governed-access-product-landing.md.
export function Hero() {
  return (
    <section id="overview" className="scroll-mt-16 bg-[#0B1220] px-6 pt-20 pb-24 md:pt-28 md:pb-32 text-center">
      <div className="max-w-3xl mx-auto flex flex-col items-center">
        <div className="flex items-center gap-2.5">
          <LogoRotating size={18} inverted />
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-300">
            Soberanía Enterprise &middot; Governed Access
          </p>
        </div>

        <h1 className="mt-7 text-[44px] md:text-7xl font-extrabold tracking-tight text-white leading-[1.05]">
          Governed Access
          <br />
          for Digital Assets
        </h1>

        <p className="mt-6 max-w-xl text-lg md:text-xl text-slate-400">
          Every access request becomes an auditable, revocable and provable operational decision.
        </p>

        <div className="mt-8 flex items-center gap-3 text-[13px] font-bold tracking-[0.16em] text-teal-300">
          <span>PROVABLE</span>
          <span className="text-slate-600">&middot;</span>
          <span>REVOCABLE</span>
          <span className="text-slate-600">&middot;</span>
          <span>AUDITABLE</span>
        </div>

        <a
          href={CTA_HREF}
          className="mt-10 inline-flex items-center justify-center rounded-full bg-teal-600 px-7 py-3.5 text-sm font-semibold text-white hover:bg-teal-500 transition-colors"
        >
          Request a Technical Assessment from Frontera Systems
        </a>

        <div className="mt-16 flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-sm text-slate-400 tracking-wide font-mono">
          <span>Request</span>
          <span aria-hidden>&rarr;</span>
          <span>Decision</span>
          <span aria-hidden>&rarr;</span>
          <span>Policy</span>
          <span aria-hidden>&rarr;</span>
          <span>Grant</span>
          <span aria-hidden>&rarr;</span>
          <span>Evidence</span>
          <span aria-hidden>&rarr;</span>
          <span>Revocation</span>
        </div>
      </div>
    </section>
  );
}
