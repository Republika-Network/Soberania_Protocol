import { FRONTERA_SYSTEMS_NAME, FRONTERA_SYSTEMS_URL } from '../brand';
import { SovereignMirrorVisual } from './SovereignMirrorVisual';
import { SoberaniaMark } from './SoberaniaMark';

export function Hero() {
  return (
    <section id="overview" className="soberania-hero relative isolate overflow-hidden scroll-mt-16 bg-[#070912]">
      <div className="soberania-atlas-grid absolute inset-0 opacity-50" aria-hidden="true" />
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_73%_44%,rgba(124,58,237,.18),transparent_30%),radial-gradient(circle_at_24%_28%,rgba(91,33,182,.08),transparent_26%)]"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto grid min-h-[760px] max-w-[94rem] items-center gap-10 px-6 py-16 lg:grid-cols-[minmax(0,.82fr)_minmax(520px,1.18fr)] lg:gap-4 lg:py-8">
        <div className="max-w-2xl lg:pl-4 xl:pl-12">
          <div className="flex items-center gap-3">
            <SoberaniaMark className="h-7 w-6" />
            <p className="font-mono text-[10px] font-bold tracking-[0.19em] text-violet-200/72 uppercase">
              A more sovereign digital world
            </p>
          </div>

          <h1 className="soberania-serif mt-7 text-[3.45rem] leading-[.93] tracking-[-.045em] text-white sm:text-6xl lg:text-[5.2rem]">
            You are sovereign.
            <span className="mt-2 block text-violet-300">What is yours should be too.</span>
          </h1>

          <p className="mt-7 max-w-xl text-[16px] leading-7 text-slate-300/78 md:text-[17px]">
            Your identity, property, assets, rights and authority increasingly exist across digital
            systems. Soberanía Protocol defines portable structures that help them preserve who they
            belong to, what they mean and how they may be governed.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href="#sovereign-sphere"
              className="inline-flex items-center justify-center border border-violet-400/65 bg-violet-500 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-violet-400"
            >
              Explore the sovereign sphere <span className="ml-2">→</span>
            </a>
            <a
              href="/?view=docs"
              className="inline-flex items-center justify-center border border-white/18 bg-white/[.035] px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/35 hover:bg-white/[.06]"
            >
              Read the docs
            </a>
          </div>

          <div className="mt-9 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[9px] tracking-[.15em] text-white/36 uppercase">
            <span>Identity</span><span>Property</span><span>Assets</span><span>Consent</span><span>Provenance</span><span>Authority</span>
          </div>

          <p className="mt-8 max-w-md border-l border-violet-300/25 pl-4 font-mono text-[10px] leading-5 tracking-[.12em] text-violet-100/45 uppercase">
            The medium may change. The owner, meaning and authority should not.
          </p>
        </div>

        <div className="relative min-h-[560px] self-stretch lg:min-h-[700px]">
          <div className="absolute inset-0 flex items-center">
            <SovereignMirrorVisual />
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto flex max-w-[94rem] flex-col gap-3 border-t border-white/10 px-6 py-5 font-mono text-[9px] tracking-[.17em] text-white/34 uppercase sm:flex-row sm:items-center sm:justify-between">
        <span>Human subject ↔ digital representation</span>
        <a
          href={FRONTERA_SYSTEMS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-violet-200/65 transition hover:text-violet-100"
        >
          {FRONTERA_SYSTEMS_NAME} governs action in real systems ↗
        </a>
      </div>
    </section>
  );
}
