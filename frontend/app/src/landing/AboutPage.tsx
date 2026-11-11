import { fronteraAssuranceHref, fronteraGovernedAccessHref, fronteraHomeHref } from './fronteraCommercial';

// Top-level "About" page for the Soberanía ecosystem as a whole — distinct from
// the Assurance-specific About page in AssuranceSupportPages.tsx. Its job
// is to make the Protocol -> Enterprise -> Solutions/Services hierarchy
// legible in one page, since that hierarchy is otherwise only implied by
// the nav menu structure.
export const renderAboutPage = () => {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/70">About Soberanía</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight md:text-6xl">
            One open foundation. One commercial provider.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/65">
            Soberanía Protocol defines the open foundation. Frontera Systems is the commercial provider that
            builds on it, offering Solutions and Services to organizations.
          </p>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-5 md:grid-cols-3 items-stretch">
            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-sm font-semibold text-cyan-200">Soberanía Protocol</p>
              <p className="mt-3 text-sm leading-7 text-white/65">
                The open foundation: canonical contracts, interoperability, references, integrity,
                capabilities, and standards. Protocol is not a commercial product or a single
                implementation — it is the open architecture everything else is built on.
              </p>
              <a href="/" className="mt-5 inline-block text-sm font-semibold text-cyan-300 hover:text-cyan-200 transition-colors">
                Explore Soberanía Protocol &rarr;
              </a>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-sm font-semibold text-cyan-200">Frontera Systems</p>
              <p className="mt-3 text-sm leading-7 text-white/65">
                The commercial provider built on Soberanía Protocol. Frontera offers pilots, assessments and
                governed-execution solutions to organizations, and is where commercial enquiries go.
              </p>
              <a href={fronteraHomeHref('about-page')} className="mt-5 inline-block text-sm font-semibold text-cyan-300 hover:text-cyan-200 transition-colors">
                Visit Frontera Systems &rarr;
              </a>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-sm font-semibold text-cyan-200">Solutions &amp; Services</p>
              <p className="mt-3 text-sm leading-7 text-white/65">
                Governed Access is a Frontera Solution. Assurance is a Frontera Service that
                assesses how sovereign, governed, and operationally mature a customer&apos;s
                platform is.
              </p>
              <div className="mt-5 flex flex-col gap-2 text-sm font-semibold">
                <a href={fronteraGovernedAccessHref('about-page')} className="text-cyan-300 hover:text-cyan-200 transition-colors">
                  Governed Access (Solution) &rarr;
                </a>
                <a href={fronteraAssuranceHref('about-page')} className="text-cyan-300 hover:text-cyan-200 transition-colors">
                  Assurance (Service) &rarr;
                </a>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight">How it fits together</h2>
          <div className="mt-8 flex flex-col gap-3 font-mono text-sm">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 text-white/80">
              Soberanía Protocol <span className="text-white/35">— open foundation</span>
            </div>
            <div className="ml-6 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 text-white/80">
              &darr; Frontera Systems <span className="text-white/35">— commercial provider</span>
            </div>
            <div className="ml-12 flex flex-col gap-3 sm:flex-row">
              <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 text-white/70">
                &darr; Solutions <span className="text-white/35">— Governed Access</span>
              </div>
              <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 text-white/70">
                &darr; Services <span className="text-white/35">— Assurance</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:p-10">
            <h2 className="text-3xl font-semibold tracking-tight">Keep exploring</h2>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="/?view=docs"
                className="inline-flex items-center justify-center rounded-xl border border-cyan-300/40 px-6 py-3 text-sm font-semibold text-cyan-200 transition hover:border-cyan-300/70 hover:bg-cyan-300/10"
              >
                Developer docs
              </a>
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Back to Protocol
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};
