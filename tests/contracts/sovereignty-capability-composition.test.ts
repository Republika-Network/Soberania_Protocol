import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalizeJSON } from '@aoc/protocol/canonical';
import {
  buildSovereignExternalReference,
  computeContentIdentity,
  contentIdentitiesEqual,
  isValidSovereignAssetId,
  isValidSovereignSubjectRef,
} from '@aoc/protocol/identity';
import { validateSovereignManifestV1 } from '@aoc/protocol/manifest';
import {
  SOVEREIGNTY_CAPABILITY_IDS,
  SOVEREIGNTY_CAPABILITY_KEYS,
  buildSovereigntyCapabilityInvocation,
  createIdentitySovereigntyCapabilityImplementation,
  createIntegritySovereigntyCapabilityImplementation,
  getSovereigntyCapability,
  getSovereigntyCapabilityRefByKey,
  invokeSovereigntyCapability,
  isValidSovereigntyCapabilityInvocationEvidence,
  listSovereigntyCapabilities,
} from '@aoc/protocol/sovereignty-capabilities';
import type {
  IdentitySovereigntyCapabilityInput,
  IdentitySovereigntyCapabilityOutput,
  IntegritySovereigntyCapabilityInput,
  IntegritySovereigntyCapabilityOutput,
  SovereigntyCapabilityRef,
  SovereigntyCapabilitySuccessResult,
} from '@aoc/protocol/sovereignty-capabilities';

const IDENTITY_REF = getSovereigntyCapabilityRefByKey('identity') as SovereigntyCapabilityRef;
const INTEGRITY_REF = getSovereigntyCapabilityRefByKey('integrity') as SovereigntyCapabilityRef;

const CORRELATION_ID = 'sm04-photo-onboarding-001';
const REGISTRANT = 'principal:sm04-registrant';
const BYTES = new TextEncoder().encode('hello sovereign world');

const capsulesDir = join(
  __dirname,
  '..',
  '..',
  'packages',
  'protocol',
  'src',
  'sovereignty-capabilities',
  'capsules',
);

const capsuleSources = (): { file: string; source: string }[] =>
  readdirSync(capsulesDir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => ({
      file,
      source: readFileSync(join(capsulesDir, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1'),
    }));

/**
 * The canonical SM-04 demonstration, run once and asserted from many angles:
 *
 *   bytes → AOC.INTEGRITY → ContentIdentity H
 *   registrant + externalReference + H → AOC.IDENTITY → Subject X + Manifest M
 *
 * Integrity never sees X; Identity never recomputes H.
 */
async function runComposition(): Promise<{
  integrityResult: SovereigntyCapabilitySuccessResult<IntegritySovereigntyCapabilityOutput>;
  identityResult: SovereigntyCapabilitySuccessResult<IdentitySovereigntyCapabilityOutput>;
}> {
  const integrityInput: IntegritySovereigntyCapabilityInput = {
    operation: 'compute-content-identity',
    bytes: BYTES,
  };
  const integrityResult = await invokeSovereigntyCapability(
    buildSovereigntyCapabilityInvocation({
      capability: INTEGRITY_REF,
      correlationId: CORRELATION_ID,
      input: integrityInput,
      // deliberately NO subject: Integrity needs no sovereign identity
    }),
    createIntegritySovereigntyCapabilityImplementation(),
  );
  if (integrityResult.status !== 'succeeded') {
    throw new Error(`Integrity failed: ${integrityResult.reasonCodes.join(', ')}`);
  }
  if (integrityResult.output.operation !== 'compute-content-identity') throw new Error('wrong operation');

  const identityInput: IdentitySovereigntyCapabilityInput = {
    registrant: REGISTRANT,
    externalReference: buildSovereignExternalReference({
      namespace: 'alien-system-v47',
      id: 'alien-resource-92817',
      locator: 'future://provider/object/92817',
    }),
    contentIdentity: integrityResult.output.contentIdentity,
  };
  const identityResult = await invokeSovereigntyCapability(
    buildSovereigntyCapabilityInvocation({
      capability: IDENTITY_REF,
      correlationId: CORRELATION_ID,
      input: identityInput,
      // deliberately NO subject: Identity creates one
    }),
    createIdentitySovereigntyCapabilityImplementation(),
  );
  if (identityResult.status !== 'succeeded') {
    throw new Error(`Identity failed: ${identityResult.reasonCodes.join(', ')}`);
  }

  return { integrityResult, identityResult };
}

describe('SM-04 / real Identity + Integrity composition (COMPOSITION TESTS 1-8)', () => {
  it('COMPOSITION TEST 1 — the Integrity digest is bound into the Identity manifest unchanged', async () => {
    const { integrityResult, identityResult } = await runComposition();
    if (integrityResult.output.operation !== 'compute-content-identity') throw new Error('wrong operation');
    const H = integrityResult.output.contentIdentity;
    const M = identityResult.output.manifest;

    expect(M.contentIdentity).toEqual(H);
    expect(contentIdentitiesEqual(M.contentIdentity!, H)).toBe(true);
    // And H is exactly what the primitive produces for those bytes.
    expect(H).toEqual(computeContentIdentity(BYTES));
    expect(identityResult.output.subject.sovereignAssetId).toBe(M.sovereignAssetId);
    expect(validateSovereignManifestV1(M).valid).toBe(true);
  });

  it('COMPOSITION TEST 2 — Integrity begins and ends without a subject; Identity ends with one', async () => {
    const { integrityResult, identityResult } = await runComposition();

    expect('subject' in integrityResult).toBe(false);
    expect('subject' in integrityResult.evidence).toBe(false);

    expect(identityResult.subject).toBeDefined();
    expect(isValidSovereignSubjectRef(identityResult.subject)).toBe(true);
    expect(identityResult.subject).toEqual(identityResult.output.subject);
    expect(isValidSovereignAssetId(identityResult.subject?.sovereignAssetId)).toBe(true);
  });

  it('COMPOSITION TEST 3 — one caller-supplied correlationId spans both evidence records', async () => {
    const { integrityResult, identityResult } = await runComposition();
    expect(integrityResult.evidence.correlationId).toBe(CORRELATION_ID);
    expect(identityResult.evidence.correlationId).toBe(CORRELATION_ID);
    expect(integrityResult.evidence.correlationId).toBe(identityResult.evidence.correlationId);
  });

  it('COMPOSITION TEST 4 — the two invocation ids remain different', async () => {
    const { integrityResult, identityResult } = await runComposition();
    expect(integrityResult.invocationId).not.toBe(identityResult.invocationId);
    expect(integrityResult.evidence.invocationId).toBe(integrityResult.invocationId);
    expect(identityResult.evidence.invocationId).toBe(identityResult.invocationId);
    // Correlation implies no ordering, causality or dependency — only grouping.
    expect(integrityResult.evidence.capability).toEqual(INTEGRITY_REF);
    expect(identityResult.evidence.capability).toEqual(IDENTITY_REF);
  });

  it('COMPOSITION TEST 5 — Identity did not recompute the digest', async () => {
    // Behavioural proof: a digest that does *not* correspond to the bytes is
    // bound verbatim. Only an implementation that never hashes can do this.
    const declared = computeContentIdentity(new TextEncoder().encode('completely different bytes'));
    const result = await invokeSovereigntyCapability(
      buildSovereigntyCapabilityInvocation({
        capability: IDENTITY_REF,
        input: { registrant: REGISTRANT, contentIdentity: declared } as IdentitySovereigntyCapabilityInput,
      }),
      createIdentitySovereigntyCapabilityImplementation(),
    );
    if (result.status !== 'succeeded') throw new Error('identity failed');
    expect(result.output.manifest.contentIdentity).toEqual(declared);
    expect(result.output.manifest.contentIdentity).not.toEqual(computeContentIdentity(BYTES));

    // Architectural proof: no hashing primitive is reachable from the Identity capsule.
    const identitySource = capsuleSources().find(({ file }) => file === 'identity.ts')?.source ?? '';
    expect(identitySource).not.toContain('computeContentIdentity');
    expect(identitySource).not.toContain('createHash');
    // Identity does not import the Integrity capsule at all.
    expect(identitySource).not.toContain("from './integrity'");
  });

  it('COMPOSITION TEST 6 — Integrity did not create identity', async () => {
    const { integrityResult } = await runComposition();
    expect(JSON.stringify(integrityResult.output)).not.toContain('aoc:sovereign-asset:');
    expect(JSON.stringify(integrityResult.evidence)).not.toContain('aoc:sovereign-asset:');

    const integritySource = capsuleSources().find(({ file }) => file === 'integrity.ts')?.source ?? '';
    expect(integritySource).not.toContain('mintSovereignAssetId');
    // Integrity does not import the Identity capsule at all.
    expect(integritySource).not.toContain("from './identity'");
  });

  it('COMPOSITION TEST 7 — both evidence records are portable, JSON-safe SM-03 evidence', async () => {
    const { integrityResult, identityResult } = await runComposition();
    for (const evidence of [integrityResult.evidence, identityResult.evidence]) {
      expect(isValidSovereigntyCapabilityInvocationEvidence(evidence)).toBe(true);
      expect(evidence.schemaVersion).toBe('aoc-sovereignty-capability-invocation-evidence/1');
      expect(evidence.outcome).toBe('succeeded');
      const roundTripped = JSON.parse(JSON.stringify(evidence));
      expect(canonicalizeJSON(roundTripped)).toBe(canonicalizeJSON(evidence));
      expect(isValidSovereigntyCapabilityInvocationEvidence(roundTripped)).toBe(true);
    }
  });

  it("COMPOSITION TEST 8 — neither evidence record duplicates the other capability's output", async () => {
    const { integrityResult, identityResult } = await runComposition();
    if (integrityResult.output.operation !== 'compute-content-identity') throw new Error('wrong operation');
    const digest = integrityResult.output.contentIdentity.digest;
    const manifest = identityResult.output.manifest;

    const integrityEvidence = JSON.stringify(integrityResult.evidence);
    const identityEvidence = JSON.stringify(identityResult.evidence);

    // The Integrity evidence names no subject, no manifest and no digest.
    expect(integrityEvidence).not.toContain(digest);
    expect(integrityEvidence).not.toContain(manifest.sovereignAssetId);
    expect(integrityEvidence).not.toContain('manifest');

    // The Identity evidence names its new subject but never the digest,
    // the manifest, the registrant or the bytes.
    expect(identityEvidence).toContain(manifest.sovereignAssetId);
    expect(identityEvidence).not.toContain(digest);
    expect(identityEvidence).not.toContain('manifest');
    expect(identityEvidence).not.toContain(REGISTRANT);
    expect(identityEvidence).not.toContain('hello sovereign world');
  });
});

describe('SM-04 / independence in both directions', () => {
  it('FLOW A — Identity alone: an external thing with no bytes at all', async () => {
    const result = await invokeSovereigntyCapability(
      buildSovereigntyCapabilityInvocation({
        capability: IDENTITY_REF,
        correlationId: 'sm04-identity-001',
        input: {
          registrant: REGISTRANT,
          externalReference: buildSovereignExternalReference({
            namespace: 'example:property-registry',
            id: 'folio-92817',
          }),
        } as IdentitySovereigntyCapabilityInput,
      }),
      createIdentitySovereigntyCapabilityImplementation(),
    );
    if (result.status !== 'succeeded') throw new Error('identity failed');

    expect(isValidSovereignAssetId(result.output.subject.sovereignAssetId)).toBe(true);
    expect(validateSovereignManifestV1(result.output.manifest).valid).toBe(true);
    expect('contentIdentity' in result.output.manifest).toBe(false);
    expect(isValidSovereigntyCapabilityInvocationEvidence(result.evidence)).toBe(true);
    expect(result.evidence.capability.id).toBe(SOVEREIGNTY_CAPABILITY_IDS.identity);
  });

  it('FLOW B — Integrity alone: bytes with no SovereignAssetId at all', async () => {
    const result = await invokeSovereigntyCapability(
      buildSovereigntyCapabilityInvocation({
        capability: INTEGRITY_REF,
        input: { operation: 'compute-content-identity', bytes: BYTES } as IntegritySovereigntyCapabilityInput,
      }),
      createIntegritySovereigntyCapabilityImplementation(),
    );
    if (result.status !== 'succeeded') throw new Error('integrity failed');
    if (result.output.operation !== 'compute-content-identity') throw new Error('wrong operation');

    expect(result.output.contentIdentity).toEqual(computeContentIdentity(BYTES));
    expect('subject' in result).toBe(false);
    expect(result.evidence.capability.id).toBe(SOVEREIGNTY_CAPABILITY_IDS.integrity);
  });

  it('composed Identity output can be re-verified by Integrity without either depending on the other', async () => {
    const { identityResult } = await runComposition();
    const declared = identityResult.output.manifest.contentIdentity!;

    const verification = await invokeSovereigntyCapability(
      buildSovereigntyCapabilityInvocation({
        capability: INTEGRITY_REF,
        subject: identityResult.output.subject,
        input: {
          operation: 'verify-content-identity',
          bytes: BYTES,
          expected: declared,
        } as IntegritySovereigntyCapabilityInput,
      }),
      createIntegritySovereigntyCapabilityImplementation(),
    );
    if (verification.status !== 'succeeded') throw new Error('verification failed to execute');
    if (verification.output.operation !== 'verify-content-identity') throw new Error('wrong operation');
    expect(verification.output.check.valid).toBe(true);
    // The subject travelled as context only; the check is over the bytes.
    expect(verification.subject?.sovereignAssetId).toBe(identityResult.output.subject.sovereignAssetId);
  });
});

describe('SM-04 / regression and boundary guarantees (REGRESSION TESTS)', () => {
  it('REGRESSION 1/12 — exactly eight canonical minerals remain, and no ninth appears', () => {
    const capabilities = listSovereigntyCapabilities();
    expect(capabilities).toHaveLength(8);
    expect(capabilities.map((capability) => capability.key)).toEqual([
      'identity',
      'integrity',
      'provenance',
      'portability',
      'interoperability',
      'verifiability',
      'licensing_terms',
      'governance_compatibility',
    ]);
  });

  it('the canonical capability versions are unchanged by adding implementations', () => {
    for (const capability of listSovereigntyCapabilities()) {
      expect(capability.version).toBe('1.0.0');
    }
    expect(getSovereigntyCapability(SOVEREIGNTY_CAPABILITY_IDS.identity)?.version).toBe('1.0.0');
    expect(getSovereigntyCapability(SOVEREIGNTY_CAPABILITY_IDS.integrity)?.version).toBe('1.0.0');
  });

  it('REGRESSION 13 — no mutable implementation registry is introduced', () => {
    for (const { source } of capsuleSources()) {
      for (const term of [
        'registerImplementation',
        'getCapabilityImplementation',
        'globalCapabilityRuntime',
        'registerIdentityCapability',
        'registerIntegrityCapability',
        'globalThis',
      ]) {
        expect(source).not.toContain(term);
      }
    }
  });

  it('REGRESSION 14/15 — no Enterprise, runtime, provider or legacy dependency is introduced', () => {
    for (const { file, source } of capsuleSources()) {
      for (const term of [
        '@aoc/enterprise',
        'pmfreak',
        '@aoc-runtime/',
        '../../runtime',
        'provider',
        'ScopeEntry',
        'StoragePointer',
        '../../content',
        '../../storage',
        '../../consent',
        'protocol/enforcement',
        'protocol/execution',
      ]) {
        expect({ file, term, present: source.includes(term) }).toEqual({ file, term, present: false });
      }
    }
  });

  it('REGRESSION 27 — exactly the canonical eight are implemented, and no ninth mineral exists', () => {
    // SM-05 legitimately added `provenance` as the third production capsule,
    // SM-06 `portability` as the fourth, SM-07 `interoperability` as the fifth,
    // SM-08 `verifiability` as the sixth, SM-09 `licensing_terms` as the
    // seventh and SM-10 `governance_compatibility` as the eighth and last. The
    // canonical inventory is now fully implemented, so this guard changes shape:
    // it no longer forbids a mineral, it pins the set closed. A capsule
    // resolving anything outside the canonical eight — a policy, authority,
    // grant, access, decision or enforcement capability — would be a ninth
    // mineral, and the registry lookup would in any case refuse it.
    const canonical = [
      'governance_compatibility',
      'identity',
      'integrity',
      'interoperability',
      'licensing_terms',
      'portability',
      'provenance',
      'verifiability',
    ];
    // Exactly one capsule resolves each canonical mineral, and exactly eight do.
    const resolved = capsuleSources()
      .flatMap(({ source }) => [...source.matchAll(/requireSovereigntyCapabilityRef\('([a-z_]+)'\)/g)])
      .map((match) => match[1])
      .sort();
    expect(resolved).toEqual(canonical);
    expect(new Set(resolved).size).toBe(8);
    expect([...SOVEREIGNTY_CAPABILITY_KEYS].sort()).toEqual(canonical);
  });

  it('the capsules import only Protocol-internal identity, manifest, claims, portability, interoperability and SM-03 modules', () => {
    // SM-05 adds the Provenance capsule, which additionally reads the canonical
    // claim primitives (`CanonicalIssuer`, `CanonicalStanding`, the canonical
    // timestamp rule) it builds provenance assertions from. SM-06 adds the
    // Portability capsule, which reads the portable bundle contract it exports
    // and imports. SM-07 adds the Interoperability capsule, which reads that
    // same bundle contract plus the interoperability contract layer it
    // describes representations with. SM-08 adds the Verifiability capsule,
    // which reads the manifest layer's verification primitives, the one
    // canonical JSON profile, and — type-only — the Protocol-owned
    // `VerificationKeyResolver` adapter contract an optional issuer binding is
    // injected through. SM-09 adds the Licensing & Terms capsule, which reads
    // the structured terms contract it declares and validates, plus the
    // manifest layer's `contestClaim`. SM-10 adds the Governance Compatibility
    // capsule, which reads the handoff contract it projects and validates, plus
    // the canonical `ResourceRef`/`CanonicalId` types that projection is
    // expressed in — `contracts` is a types-only module with no runtime
    // behaviour and is the canonical home of `ResourceRef`, so importing it is
    // reuse rather than a new dependency. SOBE-SEC-01.2 lets the Verifiability
    // capsule read the canonical layer's internal single-read capture helpers
    // (`canonical/snapshot`), so it attributes evidence from the same captured
    // bytes it verifies instead of restating that capture. Still strictly
    // Protocol-internal: no Enterprise, runtime, provider or storage module.
    const allowed = /^(\.\.\/\.\.\/(adapters|canonical(\/snapshot)?|contracts|governance-compatibility|identity|licensing|manifest|portability|interoperability|claims\/(primitives|standing|timestamps))|\.\.\/(capability-ref|implementation|invocation|ids|time)|\.\/(canonical-ref|governance-compatibility|identity|integrity|interoperability|licensing-terms|portability|provenance|verifiability))$/;
    for (const { file, source } of capsuleSources()) {
      const specifiers = [...source.matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const specifier of specifiers) {
        expect({ file, specifier, allowed: allowed.test(specifier) }).toEqual({ file, specifier, allowed: true });
      }
    }
  });
});
