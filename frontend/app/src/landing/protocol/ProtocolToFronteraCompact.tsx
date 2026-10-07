import { FRONTERA_SYSTEMS_URL } from '../brand';

export function ProtocolToFronteraCompact() {
  return (
    <section id="protocol-to-enterprise" className="relative overflow-hidden border-t border-slate-200 bg-[#11101a] text-white">
      <div className="soberania-atlas-grid absolute inset-0 opacity-35" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-6 py-20 md:py-24">
        <p className="font-mono text-[10px] font-bold tracking-[.18em] text-violet-200/58 uppercase">04 / From protocol to systems</p>
        <div className="mt-5 grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-center">
          <div>
            <h2 className="soberania-serif max-w-[11ch] text-4xl leading-[1.02] tracking-[-.035em] md:text-6xl">
              Preserve the subject. Govern the action.
            </h2>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-white/58">
              Soberanía preserves portable meaning, ownership context and governance structures. Frontera operationalizes governed authority when those structures meet real systems.
            </p>
            <a href={FRONTERA_SYSTEMS_URL} target="_blank" rel="noreferrer" className="mt-7 inline-flex border border-violet-300/28 px-5 py-3 text-sm font-semibold text-violet-100 transition hover:border-violet-200/50 hover:bg-white/[.04]">
              Explore Frontera Systems →
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <article className="border border-violet-200/18 bg-white/[.025] p-6">
              <p className="font-mono text-[9px] tracking-[.16em] text-violet-200/55 uppercase">Meaning layer</p>
              <h3 className="soberania-serif mt-2 text-3xl text-white">Soberanía Protocol</h3>
              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[10px] text-white/48">
                <span>Identity</span><span>Property</span><span>Assets</span><span>Claims</span><span>Capabilities</span><span>Provenance</span>
              </div>
            </article>

            <div className="flex items-center justify-center gap-2 text-violet-200/50 md:flex-col">
              <span className="h-px w-8 bg-current md:h-8 md:w-px" />
              <span className="font-mono text-[9px] tracking-[.14em] uppercase">same subject</span>
              <span className="h-px w-8 bg-current md:h-8 md:w-px" />
            </div>

            <article className="border border-emerald-200/16 bg-white/[.025] p-6">
              <p className="font-mono text-[9px] tracking-[.16em] text-emerald-200/50 uppercase">Execution layer</p>
              <h3 className="soberania-serif mt-2 text-3xl text-white">Frontera Systems</h3>
              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[10px] text-white/48">
                <span>Policy</span><span>Authority</span><span>Access</span><span>Approvals</span><span>Execution</span><span>Evidence</span>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
