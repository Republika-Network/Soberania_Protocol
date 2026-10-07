import { PROTOCOL_PACKAGE_URL } from '../brand';
import { SoberaniaMark } from './SoberaniaMark';

export function Developers() {
  return (
    <section id="developers" className="relative overflow-hidden border-t border-slate-200 bg-[#f7f4ee]">
      <div className="soberania-parchment-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-16 md:grid-cols-[.82fr_1.18fr] md:items-center md:py-20">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[.18em] text-violet-800 uppercase">04 / For builders</p>
          <h2 className="soberania-serif mt-4 text-4xl leading-[1.02] tracking-[-.035em] text-slate-950 md:text-5xl">Build a more sovereign internet.</h2>
          <p className="mt-4 max-w-xl text-[14px] leading-6 text-slate-600">
            Soberanía Protocol exposes its versioned public contract layer for capability, proof, credential-manifest and claim shapes through the <code className="font-mono text-[13px] text-slate-800">@aoc/protocol</code> package, under Apache-2.0. It is not yet published to a package registry; build it from source in the repository.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a href={PROTOCOL_PACKAGE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center bg-violet-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-600">
              View @aoc/protocol on GitHub
            </a>
            <a href="/?view=docs" className="inline-flex items-center justify-center border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">
              Read the docs
            </a>
          </div>
        </div>

        <div className="border border-slate-900/10 bg-[#0c0d14] p-5 text-white shadow-[0_24px_70px_rgba(15,23,42,.12)]">
          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <SoberaniaMark className="h-8 w-8" />
            <div><p className="font-mono text-[9px] tracking-[.15em] text-violet-200/55 uppercase">public contract layer</p><p className="text-sm font-semibold">@aoc/protocol</p></div>
          </div>
          <pre className="mt-5 overflow-x-auto text-[11px] leading-6 text-slate-300"><code>{`import { createSovereignManifest } from '@aoc/protocol'

// describe what the subject is
// preserve meaning across systems
// let compatible runtimes interpret it`}</code></pre>
        </div>
      </div>
    </section>
  );
}
