import { MINERALS } from '../enterprise/minerals';
import { PROTOCOL_PACKAGE_URL } from '../brand';

const m = MINERALS.amethyst;

// Dark bookend closing CTA — matching the rhythm of ../enterprise/CtaSection.tsx,
// governed-access/Assessment.tsx and assurance/Cta.tsx: one primary action
// with one secondary public-protocol action beneath it.
export function CtaSection() {
  return (
    <section className="soberania-cta relative overflow-hidden scroll-mt-16 bg-[#080a12] px-6 py-24 text-center md:py-32">
      <div className="soberania-atlas-grid absolute inset-0 opacity-35" aria-hidden="true" /><div className="relative max-w-3xl mx-auto flex flex-col items-center">
        <p className="font-mono text-[10px] font-bold tracking-[.18em] text-violet-200/55 uppercase">A more sovereign digital world</p><h2 className="soberania-serif mt-5 text-[40px] md:text-6xl font-normal tracking-[-.035em] text-white">
          Ownership should survive the platform.
        </h2>
        <p className="mt-5 max-w-2xl text-base md:text-lg leading-relaxed text-slate-400">
          Identity, property, assets, capabilities and governance should retain their meaning beyond the system that happens to hold them today.
        </p>

        <a
          href={PROTOCOL_PACKAGE_URL}
          target="_blank"
          rel="noreferrer"
          className={`mt-10 inline-flex items-center gap-2.5 rounded-full ${m.solid} px-8 py-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-transform hover:-translate-y-0.5 ${m.solidHover}`}
        >
          View @aoc/protocol on GitHub
          <svg viewBox="0 0 256 256" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
            <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
          </svg>
        </a>

        <div className="mt-6 text-sm">
          <a href="/?view=docs" className={`${m.onDark} hover:text-violet-200`}>
            Read the Docs
          </a>
        </div>
      </div>
    </section>
  );
}
