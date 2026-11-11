import { fronteraAssessmentHref, fronteraDemoHref, fronteraFitCallHref } from '../fronteraCommercial';

// SOBE-MKT-00: these actions used to be mailto links to hello@aocprotocol.xyz,
// a domain that no longer resolves. The commercial offer now lives at
// Frontera Systems, so each action goes there and says so.

// Deck slide 12 (dark bookend) — the closing CTA. "Request a Technical
// Assessment" is the single commercial entry point, matching both the
// deck's closing slide and the One Pager's CTA block — never "Contact
// Sales" or "Book Demo".
export function CtaSection() {
  return (
    <section className="scroll-mt-16 bg-[#0B1220] px-6 py-24 md:py-28 text-center">
      <div className="max-w-2xl mx-auto flex flex-col items-center">
        <h2 className="text-[32px] md:text-5xl font-extrabold tracking-tight text-white">
          Request a Technical Assessment
        </h2>
        <p className="mt-4 max-w-xl text-base md:text-lg text-slate-400">
          A scoped review of your environment. No commitment beyond the assessment itself.
        </p>

        <a
          href={fronteraAssessmentHref('enterprise-cta')}
          className="mt-10 inline-flex items-center gap-2.5 rounded-full bg-indigo-600 px-8 py-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-transform hover:-translate-y-0.5 hover:bg-indigo-500"
        >
          Request a Technical Assessment from Frontera Systems
          <svg viewBox="0 0 256 256" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
            <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
          </svg>
        </a>

        <div className="mt-6 text-sm">
          <a href={fronteraDemoHref('enterprise-cta')} className="text-indigo-300 hover:text-indigo-200">
            See the Frontera interactive demo
          </a>
          <span className="mx-4 text-slate-600">·</span>
          <a href={fronteraFitCallHref('enterprise-cta')} className="text-indigo-300 hover:text-indigo-200">
            Book a fit call with Frontera Systems
          </a>
        </div>
      </div>
    </section>
  );
}
