import { PROTOCOL_PACKAGE_URL } from '../brand';
import { AVAILABILITY, BUILDER_AUDIENCES, INTEGRATION_POINTS, type AvailabilityStatus } from './content';
import { SoberaniaMark } from './SoberaniaMark';

// "04 / For builders": who the protocol is for, how it is adopted, and an
// honest availability ledger. One section, hairline rows, no card grid: the
// homepage keeps its restraint after the hero (see the brand guidance), and
// every status shown here is read from content.ts so it changes in one place.
const STATUS_TONE: Record<AvailabilityStatus, string> = {
  'Available from source': 'border-slate-900/40 font-semibold text-slate-900',
  'Not yet available': 'border-slate-500/40 text-slate-700',
  'Internal candidate': 'border-amber-700/30 text-amber-800',
  'Prepared, not published': 'border-violet-700/30 text-violet-800',
  Proposed: 'border-slate-500/40 text-slate-700',
  'Not claimed': 'border-slate-500/40 text-slate-700',
};

export function Developers() {
  return (
    <section id="developers" className="relative overflow-hidden border-t border-slate-200 bg-[#f7f4ee]">
      <div className="soberania-parchment-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-6 py-16 md:py-20">
        <div className="grid gap-10 md:grid-cols-[.82fr_1.18fr] md:items-center">
          <div>
            <p className="font-mono text-[11px] font-bold tracking-[.18em] text-violet-800 uppercase">04 / For builders</p>
            <h2 className="soberania-serif mt-4 text-4xl leading-[1.02] tracking-[-.035em] text-slate-950 md:text-5xl">Build a more sovereign internet.</h2>
            <p className="mt-4 max-w-xl text-[15px] leading-7 text-slate-600">
              Soberanía Protocol exposes a versioned public contract layer for identity, integrity, provenance, claims and the other sovereignty capabilities, under Apache-2.0. It is not yet published to a package registry; build it from source in the repository.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a href={PROTOCOL_PACKAGE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center bg-violet-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
                View protocol source on GitHub
              </a>
              <a href="/docs" className="inline-flex items-center justify-center border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
                Read the docs
              </a>
            </div>
          </div>

          <div className="border border-slate-900/10 bg-[#0c0d14] p-5 text-white shadow-[0_24px_70px_rgba(15,23,42,.12)]">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <SoberaniaMark className="h-8 w-8" />
              <div><p className="font-mono text-[11px] tracking-[.15em] text-violet-200/60 uppercase">public contract layer</p><p className="text-sm font-semibold">Soberanía Protocol</p></div>
            </div>
            <pre className="mt-5 overflow-x-auto text-[12px] leading-6 text-slate-300"><code>{`const provenance = getSovereigntyCapabilityByKey('provenance')

provenance?.key      // 'provenance'
provenance?.version  // '1.0.0'
provenance?.name     // 'Provenance'`}</code></pre>
          </div>
        </div>

        <div className="mt-14 border-t border-slate-900/10 pt-10">
          <h3 className="font-mono text-[11px] font-bold tracking-[.18em] text-violet-800 uppercase">How integration works</h3>
          <ul className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="How integration works">
            {INTEGRATION_POINTS.map((point) => (
              <li key={point.title} className="border-l border-violet-700/30 pl-4">
                <p className="soberania-serif text-xl leading-tight text-slate-950">{point.title}</p>
                <p className="mt-2 text-[14px] leading-6 text-slate-600">{point.body}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-14 grid gap-10 border-t border-slate-900/10 pt-10 lg:grid-cols-[.82fr_1.18fr]">
          <div>
            <h3 className="font-mono text-[11px] font-bold tracking-[.18em] text-violet-800 uppercase">Who it is for</h3>
            <ul className="mt-6 space-y-3" aria-label="Developer and builder audiences">
              {BUILDER_AUDIENCES.map(({ name, summary }) => (
                <li key={name} className="text-[14px] leading-6 text-slate-600">
                  <span className="font-semibold text-slate-900">{name}</span> {summary}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 id="availability" className="font-mono text-[11px] font-bold tracking-[.18em] text-violet-800 uppercase">Ways to use Soberanía</h3>
            <dl className="mt-6 divide-y divide-slate-900/10 border-y border-slate-900/10" aria-labelledby="availability">
              {AVAILABILITY.map((row) => (
                <div key={row.item} className="grid gap-2 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                  <dt className="text-[14px] font-semibold text-slate-900">{row.item}</dt>
                  <dd className="text-[14px] leading-6 text-slate-600">
                    <span className={`mr-2 inline-block border px-2 py-0.5 font-mono text-[11px] tracking-[.06em] uppercase ${STATUS_TONE[row.status]}`}>{row.status}</span>
                    {row.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
