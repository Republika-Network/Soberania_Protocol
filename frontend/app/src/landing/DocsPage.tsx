import type { ReactNode } from 'react';
import { REPOSITORY_URL } from './brand';
import { DocsHeader, DocsSection, DocsShell } from './components/DocsShell';
import { docsStyles as s } from './components/docsStyles';
import { PACKAGE_NAMES } from './packageIdentity';
import { useRouteMeta } from './protocol/useRouteMeta';
const repositoryPath = (path: string) => `${REPOSITORY_URL}/blob/main/${path}`;
const repositoryDirectory = (path: string) => `${REPOSITORY_URL}/tree/main/${path}`;

// SOB-PUBLIC-ALIGN-01E (QA-02): the approved public package names are the
// primary identity on this page. They are NOT published, so nothing here may
// read as an install command for them. The legacy `@aoc/*` names appear only
// where they are factually needed: the workspace names on public main that the
// build-from-source steps must use, the recorded historical release
// identifiers, and the warning against resolving those scopes from npm.

const surface = [
  ['(package root)', 'Stable, type-only contracts', 'Canonical identifiers, capability and consent grants, policy decisions, scoped access requests, audit envelopes and trust-domain identifiers.'],
  ['/claims', 'Stable, mixed', 'Public claim, evidence, attestation, credential, registry, proof and vocabulary contracts. Enum objects are runtime values; most shapes are types.'],
  ['/identity', 'Implemented', 'Sovereign asset identifiers and SHA-256 identities for exact content bytes.'],
  ['/manifest', 'Implemented', 'Versioned sovereign manifests, origin and authority claims, Ed25519 proofs, verification results and a registry interface.'],
  ['/canonical', 'Implemented', 'The aoc-canonical-json/1 canonical JSON profile used by signed protocol records.'],
  ['/adapters', 'Experimental, type-only', 'Provider-neutral interfaces for verification, revocation, registries and runtime integration. No storage-provider adapter ships here.'],
  ['/runtime-registry', 'Experimental', 'An in-process adapter registry and bootstrap toolkit—not a hosted runtime, service or network.'],
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

const DOCS_META = {
  path: '/docs',
  title: 'Documentation — Soberanía Protocol',
  description:
    'Developer documentation for Soberanía Protocol: public contract entry points, the sovereign asset model, build-from-source instructions and the current availability of each component.',
};

const DARK_PRIMARY =
  'inline-flex items-center justify-center bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300';
const DARK_SECONDARY =
  'inline-flex items-center justify-center border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300';

const Code = ({ children }: { children: ReactNode }) => <code className={s.code}>{children}</code>;

const LinkCard = ({ href, title, children }: { href: string; title: string; children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className={`group block border border-slate-900/10 bg-white/60 p-6 transition hover:border-violet-700/40 hover:bg-white ${s.focus}`}
  >
    <h3 className={`${s.h3} group-hover:text-violet-800`}>
      {title} <span aria-hidden="true">↗</span>
    </h3>
    <p className="mt-3 text-sm leading-6 text-slate-600">{children}</p>
  </a>
);

// One tier of the package identity hierarchy. The order is deliberate (and
// asserted by DocsPage.test.tsx): the upcoming identity first, then what works
// today, then history, then what does not work.
const IdentityTier = ({
  id,
  index,
  label,
  status,
  statusTone,
  children,
}: {
  id: string;
  index: string;
  label: string;
  status: string;
  statusTone: string;
  children: ReactNode;
}) => (
  <li id={id} data-identity-tier={id} className="grid gap-3 py-6 md:grid-cols-[14rem_1fr] md:gap-8">
    <div>
      <p className="font-mono text-[11px] font-bold tracking-[.18em] text-slate-500">{index}</p>
      <h3 className={`${s.h3} mt-1`}>{label}</h3>
      <span className={`${s.chip} mt-3 ${statusTone}`}>{status}</span>
    </div>
    <div className={`space-y-3 ${s.body}`}>{children}</div>
  </li>
);

export function DocsPage() {
  useRouteMeta(DOCS_META);
  return (
    <DocsShell>
      <DocsHeader
        breadcrumbs={[{ label: 'Protocol', href: '/' }, { label: 'Documentation' }]}
        eyebrow="Soberanía Protocol Documentation"
        title="Build with sovereign digital assets."
      >
        <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
          Soberanía Protocol is the public, implementation-neutral contract layer for digital assets whose identity,
          integrity and interpretable claims can remain meaningful beyond one application or storage provider.
          Inspect what exists today, integrate through supported exports and help improve the open protocol.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <a href="#getting-started" className={DARK_PRIMARY}>
            Get started
          </a>
          <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" className={DARK_SECONDARY}>
            View public source <span className="ml-2" aria-hidden="true">↗</span>
          </a>
        </div>
      </DocsHeader>

      <section className="border-b border-slate-900/10">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6">
          <a
            href="/docs/manifesto"
            className={`group block border border-violet-700/25 bg-violet-700/[0.04] p-7 transition hover:border-violet-700/50 hover:bg-violet-700/[0.07] md:p-9 ${s.focus}`}
          >
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className={s.eyebrow}>Foundational document · Draft</p>
                <h2 className={s.h2}>Soberanía Manifesto v2.0</h2>
                <p className={`mt-4 max-w-3xl ${s.body}`}>
                  Human sovereignty, private property, explicit authority, bounded autonomy, consent, obligations,
                  evidence, portability, challenge and exit. Published as a draft for review and ratification.
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-violet-800 group-hover:text-violet-950">
                Read the manifesto <span aria-hidden="true">→</span>
              </span>
            </div>
          </a>
        </div>
      </section>

      <DocsSection id="getting-started" eyebrow="Getting started" title="The public semantic layer">
        <p className={`mt-5 max-w-4xl ${s.body}`}>
          The versioned protocol package publishes contracts, schemas, references and selected construction and
          verification utilities. Its approved public name is <Code>{PACKAGE_NAMES.protocol}</Code>, with the optional{' '}
          <Code>{PACKAGE_NAMES.sdk}</Code> beside it; neither is published yet. It is not a hosted API, persistence
          layer, storage adapter or complete runtime. Today you build it from source.
        </p>

        <h3 className={`${s.h3} mt-10`}>Build from source today</h3>
        <p data-legacy-context="workspace" className={`mt-3 max-w-4xl ${s.body}`}>
          Public main still uses the legacy local workspace name <Code>{PACKAGE_NAMES.legacyProtocolWorkspace}</Code>, so
          the build commands use it until the repository is migrated:
        </p>
        <pre className={`mt-5 ${s.codeBlock}`}>
          <code>{`git clone ${REPOSITORY_URL}.git\ncd Soberania_Protocol\nnpm ci\nnpm run build --workspace ${PACKAGE_NAMES.legacyProtocolWorkspace}\nnpm run protocol:pack:check`}</code>
        </pre>
        <p className="mt-4 max-w-4xl border-l-2 border-amber-700/40 pl-4 text-sm leading-6 text-amber-900">
          Current distribution status: the workspace package is at release candidate 0.2.0-rc.3. It is pre-1.0 and
          not published to any registry. Consume a locally built, checksummed tarball; breaking changes remain
          possible.
        </p>
      </DocsSection>

      <DocsSection id="package-identity" eyebrow="Package identity" title="One protocol, names in transition" tinted>
        <p className={`mt-5 max-w-4xl ${s.body}`}>
          The protocol is moving to its approved public names. Until they are published, four kinds of name coexist,
          and only the second is something you can use today.
        </p>
        <ol className="mt-8 divide-y divide-slate-900/10 border-y border-slate-900/10" aria-label="Package identity hierarchy">
          <IdentityTier
            id="identity-upcoming"
            index="01"
            label="Official package names"
            status="Upcoming · not published"
            statusTone="border-violet-700/30 text-violet-800"
          >
            <p>
              <Code>{PACKAGE_NAMES.protocol}</Code> is the protocol.
              <br />
              <Code>{PACKAGE_NAMES.sdk}</Code> is the optional SDK; the protocol never requires it.
            </p>
            <p>
              These are the primary identities of Soberanía Protocol, prepared under the project's npm organization for
              upcoming publication. They are not yet available: neither package exists on npm today. Subpath entry
              points stay the same; only the package name in import specifiers changes.
            </p>
          </IdentityTier>
          <IdentityTier
            id="identity-workspace"
            index="02"
            label="Current workspace names"
            status="Legacy · local build only"
            statusTone="border-slate-900/40 font-semibold text-slate-900"
          >
            <p>
              <Code>{PACKAGE_NAMES.legacyProtocolWorkspace}</Code> (<Code>packages/protocol</Code>) and{' '}
              <Code>{PACKAGE_NAMES.legacySdkWorkspace}</Code> (<Code>packages/aoc-sdk</Code>) are the workspace names on
              public main. Use them only for the build-from-source steps above and for locally packed{' '}
              <Code>file:</Code> tarballs. They are not registry packages.
            </p>
          </IdentityTier>
          <IdentityTier
            id="identity-historical"
            index="03"
            label="Historical release identifiers"
            status="Recorded · unchanged"
            statusTone="border-slate-500/40 text-slate-700"
          >
            <p>
              Existing release candidates keep the name they were built under, for example{' '}
              <Code>{PACKAGE_NAMES.legacyProtocolWorkspace}</Code> 0.2.0-rc.3, packed as{' '}
              <Code>aoc-protocol-&lt;version&gt;.tgz</Code>, with the checksums recorded in{' '}
              <Code>docs/release/evidence/</Code>. They are never republished under the new name.
            </p>
            <p>
              Protocol identifiers such as <Code>aoc-canonical-json/1</Code> are part of the contract and do not change
              with the package name.
            </p>
          </IdentityTier>
          <IdentityTier
            id="identity-unavailable"
            index="04"
            label="Not available: npm installation"
            status="Do not use"
            statusTone="border-red-800/40 font-semibold text-red-800"
          >
            <p>
              There is no npm install command for Soberanía Protocol yet. Installing <Code>{PACKAGE_NAMES.protocol}</Code>{' '}
              or <Code>{PACKAGE_NAMES.sdk}</Code> from npm is not possible until a founder-approved release is
              published; this page will say so when it happens.
            </p>
            <p className={`border-l-2 border-red-800/50 pl-4 ${s.strong}`}>
              Never install <Code>@aoc/*</Code> or <Code>@aoc-runtime/*</Code> from the public npm registry. This
              project does not control those scopes there, so anything published under them is untrusted. Keep them
              as local <Code>file:</Code> tarballs until you migrate.
            </p>
          </IdentityTier>
        </ol>
        <p className="mt-6 text-sm leading-6 text-slate-600">
          Migration steps, lock-file and checksum guidance:{' '}
          <a href={repositoryPath('docs/getting-started/PACKAGE_IDENTITY.md')} target="_blank" rel="noreferrer" className={s.textLink}>
            Package identity, installation and migration
          </a>
          .
        </p>
      </DocsSection>

      <DocsSection eyebrow="Digital asset model" title="Separate identity, bytes, claims and location">
        <p className={`mt-5 max-w-4xl ${s.body}`}>
          The implemented sovereign asset core uses a persistent <Code>SovereignAssetId</Code>, an exact-byte{' '}
          <Code>ContentIdentity</Code>, and a signed <Code>SovereignManifestV1</Code>. Storage bindings remain outside
          that manifest.
        </p>
        <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {assetProperties.map(([title, body]) => (
            <div key={title} className="border-l border-violet-700/30 pl-4">
              <dt className={s.h3}>{title}</dt>
              <dd className="mt-2 text-sm leading-6 text-slate-600">{body}</dd>
            </div>
          ))}
        </dl>
      </DocsSection>

      <DocsSection eyebrow="Public protocol surface" title="Supported package entry points" tinted>
        <p className={`mt-5 max-w-4xl ${s.body}`}>
          Entry points of the protocol package. The subpaths are the same under the upcoming name and the current
          workspace name.
        </p>
        <div className="mt-8 divide-y divide-slate-900/10 border-y border-slate-900/10">
          {surface.map(([name, status, description]) => (
            <article key={name} className="grid gap-2 py-5 md:grid-cols-[12rem_12rem_1fr] md:gap-6">
              <code className="font-mono text-sm font-semibold text-violet-900">{name}</code>
              <p className="font-mono text-[11px] uppercase tracking-[.06em] text-slate-600">{status}</p>
              <p className="text-sm leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
        <p className="mt-5 text-sm leading-6 text-slate-600">
          Import only declared package entry points. Deep imports from the package's <Code>src</Code> or{' '}
          <Code>dist</Code> directories are unsupported and checked by repository tooling.
        </p>
      </DocsSection>

      <DocsSection eyebrow="Integration" title="Build against what is implemented">
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <article className={s.card}>
            <span className={`${s.chip} border-slate-900/40 font-semibold text-slate-900`}>Implemented</span>
            <p className="mt-4 text-sm leading-6 text-slate-600">Build and pack the CommonJS package, import its declared subpaths, construct and verify sovereign manifests, and run the repository's consumer fixtures.</p>
          </article>
          <article className={s.card}>
            <span className={`${s.chip} border-amber-700/30 text-amber-800`}>Experimental</span>
            <p className="mt-4 text-sm leading-6 text-slate-600">Adapter interfaces and the in-process runtime registry are public but newer and more likely to evolve with implementation feedback.</p>
          </article>
          <article className={s.card}>
            <span className={`${s.chip} border-violet-700/30 text-violet-800`}>Future direction</span>
            <p className="mt-4 text-sm leading-6 text-slate-600">Registry publication, automatic cross-provider compatibility and provider implementations are not available today. Proposals must become reviewed contracts and tests before they are documented as supported.</p>
          </article>
        </div>
      </DocsSection>

      <DocsSection eyebrow="Architecture and specification" title="Read the canonical references" tinted>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <LinkCard href={repositoryPath('docs/getting-started/QUICK_START.md')} title="Consumer quick start">Real install, import, build and consumer-check commands.</LinkCard>
          <LinkCard href={repositoryPath('docs/protocol/PUBLIC_API.md')} title="Public API">Governed exports, stability classifications and compatibility rules.</LinkCard>
          <LinkCard href={repositoryPath('docs/architecture/sovereign-asset-core.md')} title="Sovereign asset core">Identity, content integrity, manifest, proof, registry and explicit non-goals.</LinkCard>
          <LinkCard href={repositoryPath('docs/architecture/protocol-enterprise-separation-report.md')} title="Protocol boundary">The repository-enforced separation between public contracts and proprietary runtime implementation.</LinkCard>
        </div>
      </DocsSection>

      <DocsSection eyebrow="Product boundary" title="Protocol describes; products implement">
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <article className="border border-violet-700/25 bg-violet-700/[0.04] p-6">
            <h3 className={s.h3}>Soberanía Protocol · public and open</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">Owns provider-independent asset semantics, public contract shapes, references and adapter interfaces.</p>
          </article>
          <article className={s.card}>
            <h3 className={s.h3}>Frontera Systems · optional commercial layer</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">One product that uses Protocol-compatible assets in governance and enforcement workflows. The protocol has no dependency on Frontera: you can adopt any capability without it. Frontera internals are not documented on this public surface.</p>
          </article>
        </div>
      </DocsSection>

      <section className="relative overflow-hidden bg-[#080a12] text-white">
        <div className="soberania-atlas-grid absolute inset-0 opacity-35" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 md:py-20">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[.18em] text-violet-200/75">Contributing</p>
          <h2 className="soberania-serif mt-3 text-3xl leading-[1.05] tracking-[-.03em] text-white md:text-4xl">Inspect it. Challenge it. Improve it.</h2>
          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">
            The repository is the contribution hub. Use its issue tracker to report defects or propose protocol
            improvements, and open a pull request with tests and a Changeset when a public contract changes.
            There is not yet a separate contribution guide or configured public discussion forum; development and
            release requirements are documented in the repository itself.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" className={DARK_PRIMARY}>Open repository</a>
            <a href={`${REPOSITORY_URL}/issues`} target="_blank" rel="noreferrer" className={DARK_SECONDARY}>Report or propose an issue</a>
            <a href={repositoryDirectory('test-consumers')} target="_blank" rel="noreferrer" className={DARK_SECONDARY}>Inspect consumer examples</a>
            <a href={repositoryPath('.changeset/README.md')} target="_blank" rel="noreferrer" className={DARK_SECONDARY}>Review change process</a>
          </div>
        </div>
      </section>
    </DocsShell>
  );
}
