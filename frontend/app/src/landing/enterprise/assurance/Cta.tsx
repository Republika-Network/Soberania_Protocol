import { fronteraAssessmentHref } from '../../fronteraCommercial';
// SOBE-MKT-00: was a mailto to hello@aocprotocol.xyz (domain no longer resolves).
const CTA_HREF = fronteraAssessmentHref('assurance-cta');

// Section 10 — closing CTA. Dark bookend matching governed-access/
// Assessment.tsx and ../CtaSection.tsx. One CTA, no pricing, no checkout,
// no secondary product pitch — the same email intake route the rest of
// Soberanía Enterprise uses for "Request Technical Assessment", since no
// dedicated assessment-intake workflow exists yet. See
// docs/w007-assurance-canonical-assessment-layer.md "Accuracy Boundaries".
export function Cta() {
  return (
    <section className="scroll-mt-16 bg-[#0B1220] px-6 py-24 md:py-28 text-center">
      <div className="max-w-2xl mx-auto flex flex-col items-center">
        <h2 className="text-[32px] md:text-5xl font-extrabold tracking-tight text-white">
          Know where your architecture actually stands
        </h2>
        <p className="mt-4 max-w-xl text-base md:text-lg text-slate-400">
          A scoped Technical Assessment against the full Protocol sovereignty and Enterprise governance
          capability surface. No commitment beyond the assessment itself.
        </p>

        <a
          href={CTA_HREF}
          className="mt-10 inline-flex items-center gap-2.5 rounded-full bg-emerald-600 px-8 py-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-transform hover:-translate-y-0.5 hover:bg-emerald-500"
        >
          Request a Technical Assessment from Frontera Systems
          <svg viewBox="0 0 256 256" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
            <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
          </svg>
        </a>
      </div>
    </section>
  );
}
