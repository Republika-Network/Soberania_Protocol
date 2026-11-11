import { fronteraAssessmentHref, fronteraDemoHref, fronteraFitCallHref } from './fronteraCommercial';

// SOBE-MKT-00: this page used to render a form whose submit button only opened
// a prefilled email draft ("Open email draft"), so nothing was submitted and a
// visitor without a mail client lost their message. It now offers two honest
// routes: business enquiries go to Frontera Systems (the commercial provider,
// with a live booking and checkout path), and protocol / developer questions go
// to email, presented as email.
const CONTACT_EMAIL = 'vicvalch@onchainfest.xyz';

export function renderContactPage() {
  return <ContactPage />;
}

const PRIMARY =
  'inline-flex items-center justify-center rounded-xl border border-cyan-300/35 bg-cyan-300/90 px-6 py-3 text-sm font-semibold text-[#031018] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200';
const SECONDARY =
  'inline-flex items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200';

function ContactPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/70">
            Contact Soberanía Protocol
          </p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight md:text-6xl">
            Let&apos;s design explicit access together.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/65">
            Choose the route that fits your question.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-cyan-300/25 bg-white/[0.03] p-8 md:p-10">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-300/70">For organizations</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Pilots, assessments and enterprise integration</h2>
            <p className="mt-4 text-sm leading-7 text-white/65">
              Commercial work built on Soberanía Protocol is offered by Frontera Systems. Book a short fit call or
              request a Technical Assessment on frontera-systems.com, or try the interactive demo first.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a href={fronteraFitCallHref('contact-page')} className={PRIMARY}>
                Book a fit call with Frontera Systems
              </a>
              <a href={fronteraAssessmentHref('contact-page')} className={SECONDARY}>
                Frontera Technical Assessment
              </a>
              <a href={fronteraDemoHref('contact-page')} className={SECONDARY}>
                See the interactive demo
              </a>
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 md:p-10">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-300/70">For the protocol</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Developers, research and partnerships</h2>
            <p className="mt-4 text-sm leading-7 text-white/65">
              Questions about the protocol, developer collaboration or partnerships: email us directly at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-cyan-300 hover:text-cyan-200">
                {CONTACT_EMAIL}
              </a>
              . Your email client opens; nothing is stored by this site.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Soberanía Protocol Inquiry')}`} className={SECONDARY}>
                Email Soberanía Protocol
              </a>
              <a href="/?view=docs" className={SECONDARY}>
                Review Docs
              </a>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

