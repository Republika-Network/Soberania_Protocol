import type { ReactNode } from 'react';
import { DocsHeader, DocsShell } from './components/DocsShell';
import { docsStyles as s } from './components/docsStyles';
import { useRouteMeta } from './protocol/useRouteMeta';

const principles = [
  ['Identity', 'Your identity remains yours.', 'A platform, custodian, employer, application, network, or autonomous agent should not become the owner of a person\'s identity merely because it stores, authenticates, processes, or represents it.'],
  ['Property', 'Your property remains yours.', 'Technology may represent, custody, transact with, or automate actions involving property. Technical control must not quietly become ownership.'],
  ['Authority', 'Authority must be explicitly granted.', 'Access is not authority. Possession is not authority. Technical capability is not authority. Authority requires a legitimate source, defined scope, conditions, duration, and accountability.'],
  ['Exit', 'Sovereignty requires the ability to leave.', 'Identity, legitimate claims, history, and portable evidence should not disappear because a user changes providers, revokes consent, or leaves a governance domain.'],
] as const;

const commitments = [
  'Human sovereignty',
  'Legitimate private property — physical and digital',
  'Explicit authority',
  'Bounded delegation',
  'Meaningful consent',
  'Revocability',
  'Portability',
  'Traceability',
  'Challenge',
  'Evidence',
  'No silent expansion of power',
] as const;

const questions = [
  'Who gave it authority?',
  'What is it allowed to do?',
  'What can it never do?',
  'What obligations must it satisfy?',
  'Who retains ownership and control?',
  'What evidence remains after it acts?',
] as const;

const BodySection = ({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) => (
  <section className="border-b border-slate-900/10">
    <div className="mx-auto max-w-4xl px-5 py-14 sm:px-6 md:py-16">
      <p className={s.eyebrow}>{number}</p>
      <h2 className={s.h2}>{title}</h2>
      <div className="mt-6 space-y-5 text-base leading-8 text-slate-700">{children}</div>
    </div>
  </section>
);

const MANIFESTO_META = {
  path: '/docs/manifesto',
  title: 'Soberanía Manifesto v2.0 (draft) — Soberanía Protocol',
  description:
    'The Soberanía Manifesto v2.0, published as a draft for review and ratification: human sovereignty, explicit authority, bounded autonomy, consent, evidence, portability and the right to exit.',
  ogType: 'article' as const,
};

export const ManifestoPage = () => {
  useRouteMeta(MANIFESTO_META);
  return (
    <DocsShell>
      <DocsHeader
        breadcrumbs={[
          { label: 'Protocol', href: '/' },
          { label: 'Documentation', href: '/docs' },
          { label: 'Manifesto' },
        ]}
        badges={
          <>
            <span className="border border-violet-200/40 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[.14em] text-violet-100">
              Version 2.0
            </span>
            <span
              data-status="draft"
              className="border border-amber-300/60 bg-amber-300/10 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[.14em] text-amber-200"
            >
              Draft for Review and Ratification
            </span>
          </>
        }
        eyebrow="Soberanía Manifesto"
        title="Building systems that preserve human sovereignty."
      >
          <p className="mt-7 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
            Technology is acquiring agency. Software can make decisions, access infrastructure, invoke services,
            move assets, execute transactions, coordinate other systems, and increasingly act on behalf of people
            and organizations.
          </p>

          <ul className="mt-10 grid max-w-4xl gap-3 sm:grid-cols-2" aria-label="Questions every system must answer">
            {questions.map((question) => (
              <li key={question} className="border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                {question}
              </li>
            ))}
          </ul>

          <blockquote className="soberania-serif mt-10 max-w-4xl border-l-2 border-violet-300/70 pl-6 text-2xl leading-9 text-white">
            Intelligence without boundaries is not sovereignty. It is merely capability — and capability is not authority.
          </blockquote>
      </DocsHeader>

      <BodySection number="01" title="Why Soberanía exists">
        <p>Most digital systems were built to maximize what platforms can know, retain, control, or monetize.</p>
        <p>Users generate data. Organizations accumulate knowledge. Platforms mediate access. Algorithms increasingly make decisions. Yet the people who create the value often lose visibility or control over what happens afterward.</p>
        <p>We believe another architecture is possible: one where intelligent systems can act without becoming sovereign over the people, organizations, knowledge, or property they serve.</p>
        <p className="font-semibold text-slate-950">Technology should serve people. People should not become subjects of the systems they create.</p>
      </BodySection>

      <BodySection number="02" title="What sovereignty means">
        <p>Sovereignty does not mean isolation. It does not mean rejecting coordination, institutions, markets, automation, or shared infrastructure.</p>
        <p>Sovereignty means preserving meaningful control: understanding what authority has been granted, what information is being used, what systems may act, under what conditions, what property or resources they may affect, what obligations constrain them, what evidence their actions produce, how authority can be challenged or revoked, and how to exit without surrendering identity or legitimate rights.</p>
        <p className="font-semibold text-slate-950">Sovereignty means the ability to choose, delegate, verify, revoke, challenge, and leave.</p>
      </BodySection>

      <section className="border-b border-slate-900/10 bg-[#f3efe6]">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-6">
          <p className={s.eyebrow}>03</p>
          <h2 className={s.h2}>Four foundational principles</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {principles.map(([title, headline, body]) => (
              <article key={title} className="border border-slate-900/10 bg-white/70 p-6">
                <p className={s.eyebrow}>{title}</p>
                <h3 className={`${s.h3} mt-3`}>{headline}</h3>
                <p className="mt-4 text-sm leading-7 text-slate-600">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <BodySection number="04" title="Property, control, and sovereignty">
        <p>Sovereignty loses meaning if people cannot maintain authority over what legitimately belongs to them.</p>
        <p>Soberanía Protocol therefore recognizes <strong className="text-slate-950">private property — physical and digital — as a fundamental extension of human autonomy.</strong></p>
        <p>A custodian does not become the owner merely because it holds an asset. A platform does not become the owner because it maintains the database. An autonomous agent does not gain authority because it possesses credentials. A payment does not automatically convey every right associated with an asset.</p>
        <p><strong className="text-slate-950">Physical property.</strong> As vehicles, homes, machinery, infrastructure, inventories, and other physical assets become software-mediated, digital control must not silently override legitimate ownership or authority.</p>
        <p><strong className="text-slate-950">Digital property.</strong> Digital assets, credentials, financial instruments, intellectual creations, tokenized assets, cryptographic assets, and data sets should be able to preserve identity, provenance, authority, applicable rights, obligations, delegation, revocation, transfer history, and evidence.</p>
        <p>Soberanía Protocol does not declare itself a court and does not unilaterally determine legal ownership. It provides infrastructure to represent, preserve, verify, and enforce authority boundaries without pretending that technical possession is legal truth.</p>
      </BodySection>

      <BodySection number="05" title="Authority before action">
        <p>Modern security often answers: <strong className="text-slate-950">Who are you?</strong> That is necessary. It is no longer sufficient.</p>
        <p>Autonomous systems require another question: <strong className="text-slate-950">What are you authorized to do right now?</strong></p>
        <p>Authority should identify the actor, resource, action, source of authority, purpose, duration, limits, obligations, revocation conditions, and required evidence.</p>
        <p className="font-semibold text-slate-950">Delegation should be explicit, bounded, attenuated, traceable, temporary, and revocable.</p>
      </BodySection>

      <BodySection number="06" title="Governance is executable">
        <p>Governance should not live only in policy manuals or depend entirely on people remembering what the rules were.</p>
        <p>Soberanía treats governance as the translation of authority into repeatable, inspectable, and enforceable behavior: what may happen, what may happen only under conditions, what must happen, and what must never happen.</p>
      </BodySection>

      <BodySection number="07" title="Consent is not a one-time click">
        <p>Consent should not be interpreted as permanent surrender. Meaningful consent must have scope, purpose, duration, understandable terms, an identifiable recipient of authority, and a mechanism for withdrawal when applicable.</p>
        <p>Revocation should stop future authority where appropriate, but it should not rewrite history. A trustworthy system must be capable of saying: <strong className="text-slate-950">This was authorized then. It is not authorized now.</strong></p>
      </BodySection>

      <BodySection number="08" title="Obligations matter as much as permissions">
        <p>Traditional access systems focus heavily on permission: allow or deny. Real-world governance is richer.</p>
        <p>An action may require a precondition, a continuing obligation, a postcondition, evidence, attribution, settlement, human approval, or another condition that must remain true.</p>
        <p className="font-semibold text-slate-950">Permission without obligation is often incomplete governance.</p>
      </BodySection>

      <BodySection number="09" title="Evidence before trust">
        <p>A system should not merely claim that governance occurred. It should be able to show it.</p>
        <p>Important actions should produce enough evidence to reconstruct what happened, who or what acted, under which authority, which policy applied, which obligations existed, which decision was made, what was executed, when it occurred, and whether authority was later revoked, challenged, or superseded.</p>
        <p>A claim proves that someone made a claim. A signature proves that a key produced a signature. Neither automatically proves the underlying statement is legally or factually true.</p>
      </BodySection>

      <BodySection number="10" title="Autonomy without absolute power">
        <p>We do not oppose autonomous systems. We expect them. AI agents will transact, negotiate, purchase services, move assets, interact with infrastructure, coordinate with other agents, and act faster than humans can manually supervise every decision.</p>
        <p>The answer is not to prohibit autonomy. The answer is <strong className="text-slate-950">bounded autonomy</strong>.</p>
        <p>The objective is not human approval for every action. The objective is human sovereignty over the rules under which autonomous action occurs.</p>
      </BodySection>

      <BodySection number="11" title="Intelligence without extraction">
        <p>Technological progress should not require indiscriminate extraction of human information.</p>
        <p>People should retain meaningful rights over information generated by or about them. Organizations should be able to derive intelligence without assuming unlimited rights over every underlying datum. Systems should seek the minimum information necessary to perform authorized actions.</p>
        <p className="font-semibold text-slate-950">Systems can learn without becoming owners of everyone they learn from.</p>
      </BodySection>

      <BodySection number="12" title="Knowledge as infrastructure">
        <p>Human knowledge is one of the world's most valuable resources: professional judgment, legal reasoning, operational practices, scientific methods, institutional knowledge, commercial processes, and technical expertise.</p>
        <p>Intelligent systems can help transform this knowledge into reusable infrastructure, but that transformation should preserve attribution where appropriate, authority, provenance, consent, accountability, and the ability to challenge or revise what has been encoded.</p>
      </BodySection>

      <section className="border-b border-slate-900/10 bg-[#f3efe6]">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-6">
          <p className={s.eyebrow}>13</p>
          <h2 className={s.h2}>Building on Soberanía is a responsibility</h2>
          <p className="mt-6 max-w-4xl text-base leading-8 text-slate-700">Systems claiming alignment with Soberanía should preserve minimum principles:</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {commitments.map((item) => (
              <span key={item} className="border border-violet-700/25 bg-white/70 px-4 py-2 text-sm text-slate-800">{item}</span>
            ))}
          </div>
          <p className="soberania-serif mt-8 text-2xl leading-9 text-slate-950">Sovereignty is demonstrated by the constraints a system is willing to place on its own power.</p>
        </div>
      </section>

      <BodySection number="14" title="What Soberanía is not">
        <p>Soberanía is not a claim that technology can replace law. It is not a declaration that code alone determines ownership. It is not a mechanism for granting unlimited power to AI agents.</p>
        <p>It is not a platform designed to accumulate control over everyone who uses it. It is not an excuse to eliminate institutions or accountability. It is not a promise that cryptography can resolve every human dispute.</p>
        <p>Soberanía exists to make <strong className="text-slate-950">authority and its boundaries more explicit</strong>, not to pretend human society can be reduced entirely to code.</p>
      </BodySection>

      <section className="border-b border-slate-900/10">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-6">
          <p className={s.eyebrow}>15</p>
          <h2 className={s.h2}>The Soberanía Pledge</h2>
          <div className="mt-8 border border-violet-700/25 border-l-4 border-l-violet-700 bg-white/70 p-7 md:p-10">
            <p className="soberania-serif text-2xl leading-9 text-slate-950">We will build systems that preserve human sovereignty.</p>
            <div className="mt-6 space-y-3 text-base leading-7 text-slate-700">
              <p>We will not treat access as ownership.</p>
              <p>We will not treat possession as unlimited authority.</p>
              <p>We will respect legitimate private property, physical and digital.</p>
              <p>We will make delegated authority explicit and bounded.</p>
              <p>We will preserve meaningful consent and revocation.</p>
              <p>We will design autonomy within enforceable limits.</p>
              <p>We will preserve evidence of consequential actions.</p>
              <p>We will support challenge, portability, and exit.</p>
              <p>We will not intentionally expand a system's authority beyond that granted to it.</p>
              <p>We will not use technological capability as justification for silent appropriation of identity, knowledge, assets, or control.</p>
            </div>
            <p className="soberania-serif mt-8 text-xl text-violet-900">Technology should amplify human agency, not replace human sovereignty.</p>
          </div>
        </div>
      </section>

      <BodySection number="16" title="Our bet">
        <p>We believe the next generation of intelligent systems will not be defined only by better models. It will be defined by <strong className="text-slate-950">who retains authority when those models begin to act.</strong></p>
        <p>It will be defined by whether ownership remains meaningful when property becomes digitally mediated, whether consent remains revocable, whether agents operate under bounded authority, whether actions leave reconstructible evidence, and whether people and organizations can participate without surrendering the ability to leave.</p>
        <p>Our objective is not to stop a future with more intelligence, automation, agents, machine-to-machine transactions, and digitally mediated property.</p>
        <p className="soberania-serif text-2xl leading-9 text-slate-950">Our objective is to make sure that when it arrives, people remain sovereign.</p>
      </BodySection>

      <section className="relative overflow-hidden bg-[#080a12] text-white">
        <div className="soberania-atlas-grid absolute inset-0 opacity-35" aria-hidden="true" />
        <div className="relative mx-auto max-w-5xl px-5 py-20 sm:px-6 md:py-24">
          <div className="text-center">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[.18em] text-violet-200/75">Soberanía Protocol</p>
            <div className="soberania-serif mt-6 space-y-2 text-3xl tracking-[-.02em] md:text-4xl">
              <p>Identity remains yours.</p>
              <p>Property remains yours.</p>
              <p>Authority must be granted.</p>
              <p>Sovereignty requires exit.</p>
            </div>
            <p className="mt-8 text-lg font-semibold text-violet-100">Autonomy should never mean the absence of authority.</p>
            <p data-status="draft" className="mx-auto mt-8 max-w-2xl border border-amber-300/40 px-4 py-3 text-sm leading-7 text-amber-100">
              Status: Draft for Review and Ratification. This publication does not represent a ratified constitutional artifact.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a href="/docs" className="inline-flex items-center justify-center border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300">
                Back to documentation
              </a>
              <a href="/" className="inline-flex items-center justify-center bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300">
                Explore Soberanía Protocol
              </a>
            </div>
          </div>
        </div>
      </section>
    </DocsShell>
  );
};
