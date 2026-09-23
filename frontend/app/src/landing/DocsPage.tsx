import { Breadcrumbs } from './components/Breadcrumbs';
import { REPOSITORY_URL } from './brand';
const repositoryPath = (path: string) => `${REPOSITORY_URL}/blob/main/${path}`;
const repositoryDirectory = (path: string) => `${REPOSITORY_URL}/tree/main/${path}`;

const surface = [
  ['@aoc/protocol', 'Stable, type-only contracts', 'Canonical identifiers, capability and consent grants, policy decisions, scoped access requests, audit envelopes and trust-domain identifiers.'],
  ['@aoc/protocol/claims', 'Stable, mixed', 'Public claim, evidence, attestation, credential, registry, proof and vocabulary contracts. Enum objects are runtime values; most shapes are types.'],
  ['@aoc/protocol/identity', 'Implemented', 'Sovereign asset identifiers and SHA-256 identities for exact content bytes.'],
  ['@aoc/protocol/manifest', 'Implemented', 'Versioned sovereign manifests, origin and authority claims, Ed25519 proofs, verification results and a registry interface.'],
  ['@aoc/protocol/canonical', 'Implemented', 'The aoc-canonical-json/1 canonical JSON profile used by signed protocol records.'],
  ['@aoc/protocol/adapters', 'Experimental, type-only', 'Provider-neutral interfaces for verification, revocation, registries and runtime integration. No storage-provider adapter ships here.'],
  ['@aoc/protocol/runtime-registry', 'Experimental', 'An in-process adapter registry and bootstrap toolkit—not a hosted runtime, service or network.'],
];

const assetProperties = [
  ['Identity', 'SovereignAssetId persists independently of content, manifest and storage location.'],
  ['Integrity', 'ContentIdentity identifies exact bytes with SHA-256; the signed manifest carries its own digest and proof.'],
  ['Origin', 'OriginClaim is an explicit, contestable claim. A registrant is not asserted to be a legal owner.'],
  ['Capabilities', 'Public capability contracts describe bounded authority; they do not provide universal enforcement.'],
  ['References', 'Canonical references connect protocol records without requiring one provider or runtime.'],
  ['Portability', 'Storage pointers are deliberately outside the sovereign manifest, so storage location does not define asset identity.'],
  ['Compatibility', 'Public schemas and adapter interfaces provide common meaning; support still depends on each implementation.'],
];

export const renderDocsPage = () => {
  const LinkCard = ({ href, title, children }: { href: string; title: string; children: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.04]"
    >
      <h3 className="font-semibold text-cyan-200 group-hover:text-cyan-100">{title} <span aria-hidden>↗</span></h3>
      <p className="mt-3 text-sm leading-7 text-white/60">{children}</p>
    </a>
  );

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      <Breadcrumbs items={[{ label: 'Protocol', href: '/' }, { label: 'Documentation' }]} />

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/70">Soberanía Protocol Documentation</p>
          <h1 className="mt-4 max-w-4xl text-5xl font-semibold tracking-tight md:text-6xl">
            Build with sovereign digital assets.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/65">
            Soberanía Protocol is the public, implementation-neutral contract layer for digital assets whose identity,
            integrity and interpretable claims can remain meaningful beyond one application or storage provider.
            Inspect what exists today, integrate through supported exports and help improve the open protocol.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="#getting-started" className="inline-flex items-center justify-center rounded-xl bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
              Get started
            </a>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:text-white">
              View public source <span className="ml-2" aria-hidden>↗</span>
            </a>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <a
            href="/docs/manifesto"
            className="group block rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.04] p-7 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.06] md:p-9"
          >
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Foundational document</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">Soberanía Manifesto v2.0</h2>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">
                  Human sovereignty, private property, explicit authority, bounded autonomy, consent, obligations,
                  evidence, portability, challenge and exit. Published as a draft for review and ratification.
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-cyan-200 group-hover:text-cyan-100">
                Read the manifesto →
              </span>
            </div>
          </a>
        </div>
      </section>

      <section id="getting-started" className="scroll-mt-8 border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/65">Getting started</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">The public semantic layer</h2>
          <p className="mt-5 max-w-4xl text-base leading-8 text-white/65">
            The versioned <code className="text-cyan-200">@aoc/protocol</code> package publishes contracts, schemas,
            references and selected construction and verification utilities. It is not a hosted API, persistence layer,
            storage adapter or complete runtime. Start by cloning the repository, installing dependencies and building
            the package from source.
          </p>
          <pre className="mt-8 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-6 text-sm leading-7 text-cyan-100"><code>{`git clone ${REPOSITORY_URL}.git\ncd Architects_of_Change_Protocol\nnpm ci\nnpm run build --workspace @aoc/protocol\nnpm run protocol:pack:check`}</code></pre>
          <p className="mt-4 text-sm leading-7 text-amber-200/75">
            Current distribution status: version 0.1.0 is pre-1.0 and the package is not published to a registry.
            Consume a locally built tarball; breaking changes remain possible.
          </p>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/65">Digital asset model</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Separate identity, bytes, claims and location</h2>
          <p className="mt-5 max-w-4xl text-base leading-8 text-white/65">
            The implemented sovereign asset core uses a persistent <code className="text-cyan-200">SovereignAssetId</code>,
            an exact-byte <code className="text-cyan-200">ContentIdentity</code>, and a signed
            <code className="ml-1 text-cyan-200">SovereignManifestV1</code>. Storage bindings remain outside that manifest.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {assetProperties.map(([title, body]) => (
              <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-white/60">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/65">Public protocol surface</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Supported package entry points</h2>
          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
            {surface.map(([name, status, description]) => (
              <article key={name} className="grid gap-2 border-b border-white/10 p-5 last:border-b-0 md:grid-cols-[15rem_11rem_1fr] md:gap-5">
                <code className="text-sm text-cyan-200">{name}</code>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">{status}</p>
                <p className="text-sm leading-6 text-white/60">{description}</p>
              </article>
            ))}
          </div>
          <p className="mt-5 text-sm leading-7 text-white/55">
            Import only declared package entry points. Deep imports from <code>@aoc/protocol/src</code> or
            <code className="ml-1">@aoc/protocol/dist</code> are unsupported and checked by repository tooling.
          </p>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/65">Integration</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Build against what is implemented</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <article className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.04] p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200">Implemented</p>
              <p className="mt-3 text-sm leading-7 text-white/65">Build and pack the CommonJS package, import its declared subpaths, construct and verify sovereign manifests, and run the repository's consumer fixtures.</p>
            </article>
            <article className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">Experimental</p>
              <p className="mt-3 text-sm leading-7 text-white/65">Adapter interfaces and the in-process runtime registry are public but newer and more likely to evolve with implementation feedback.</p>
            </article>
            <article className="rounded-2xl border border-violet-300/20 bg-violet-300/[0.04] p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-200">Future direction</p>
              <p className="mt-3 text-sm leading-7 text-white/65">Registry publication, automatic cross-provider compatibility and provider implementations are not available today. Proposals must become reviewed contracts and tests before they are documented as supported.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/65">Architecture and specification</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Read the canonical references</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <LinkCard href={repositoryPath('docs/getting-started/QUICK_START.md')} title="Consumer quick start">Real install, import, build and consumer-check commands.</LinkCard>
            <LinkCard href={repositoryPath('docs/protocol/PUBLIC_API.md')} title="Public API">Governed exports, stability classifications and compatibility rules.</LinkCard>
            <LinkCard href={repositoryPath('docs/architecture/sovereign-asset-core.md')} title="Sovereign asset core">Identity, content integrity, manifest, proof, registry and explicit non-goals.</LinkCard>
            <LinkCard href={repositoryPath('docs/architecture/protocol-enterprise-separation-report.md')} title="Protocol boundary">The repository-enforced separation between public contracts and proprietary runtime implementation.</LinkCard>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/65">Product boundary</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Protocol describes; products implement</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <article className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.04] p-6">
              <h3 className="font-semibold text-cyan-100">Soberanía Protocol · public and open</h3>
              <p className="mt-3 text-sm leading-7 text-white/65">Owns provider-independent asset semantics, public contract shapes, references and adapter interfaces.</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h3 className="font-semibold text-white">Soberanía Enterprise · organizational governance</h3>
              <p className="mt-3 text-sm leading-7 text-white/65">May use Protocol-compatible assets in proprietary governance and enforcement workflows. Enterprise implementation internals are intentionally not documented on this public surface.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.04] p-8 md:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Contributing</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Inspect it. Challenge it. Improve it.</h2>
            <p className="mt-4 max-w-3xl text-base leading-8 text-white/65">
              The repository is the contribution hub. Use its issue tracker to report defects or propose protocol
              improvements, and open a pull request with tests and a Changeset when a public contract changes.
              There is not yet a separate contribution guide or configured public discussion forum; development and
              release requirements are documented in the repository itself.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-xl bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">Open repository</a>
              <a href={`${REPOSITORY_URL}/issues`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/85 transition hover:border-white/30">Report or propose an issue</a>
              <a href={repositoryDirectory('test-consumers')} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/85 transition hover:border-white/30">Inspect consumer examples</a>
              <a href={repositoryPath('.changeset/README.md')} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/85 transition hover:border-white/30">Review change process</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};
