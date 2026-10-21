/**
 * The frozen cross-repository integration contract
 * (`packages/protocol/integration-contract.json`) is what Soberanía Enterprise and PMFreak are
 * asked to depend on. `scripts/check-integration-contract.mjs` is its full gate; these tests give
 * the same invariants fast, in-suite feedback, so a drifting export set is caught by `npm test`
 * rather than only by the release-candidate battery.
 *
 * See docs/integration/CROSS_REPO_INTEGRATION_CONTRACT.md.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../..');
const readJson = (relativePath: string): Record<string, any> =>
  JSON.parse(readFileSync(join(repositoryRoot, relativePath), 'utf8'));

const contract = readJson('packages/protocol/integration-contract.json');
const protocolPackage = readJson('packages/protocol/package.json');

describe('cross-repository integration contract', () => {
  it('is frozen and exactly versioned', () => {
    expect(contract.contract).toBe('aoc.cross-repository-integration');
    expect(contract.status).toBe('frozen');
    expect(contract.contractVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(contract.frozenAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('describes the package it ships inside', () => {
    expect(contract.protocol.package).toBe(protocolPackage.name);
    expect(contract.protocol.version).toBe(protocolPackage.version);
    expect(contract.protocol.license).toBe(protocolPackage.license);
    expect(contract.protocol.moduleFormat).toBe(protocolPackage.type);
    expect(contract.protocol.engines.node).toBe(protocolPackage.engines.node);
    expect(contract.protocol.packageRepositoryUrl).toBe(protocolPackage.repository.url);
    expect(contract.protocol.runtimeDependencies).toEqual({});
    expect(protocolPackage.dependencies ?? {}).toEqual({});
  });

  it('declares exactly the package export set — in both directions', () => {
    const contracted = contract.protocol.exports.map((entry: { path: string }) => entry.path).sort();
    const declared = Object.keys(protocolPackage.exports).sort();
    expect(contracted).toEqual(declared);
  });

  it('classifies every contracted export', () => {
    for (const entry of contract.protocol.exports) {
      expect(['stable', 'stable-expanding', 'experimental', 'metadata']).toContain(entry.stability);
      expect(['type-only', 'runtime', 'mixed', 'json']).toContain(entry.kind);
    }
  });

  it('ships as packaged metadata and does not widen the public export surface', () => {
    expect(protocolPackage.files).toContain('integration-contract.json');
    // P0-PKG-01 requires the export surface to be unchanged: the contract travels the way LICENSE
    // and NOTICE do, read by path, never imported.
    expect(protocolPackage.exports['./integration-contract.json']).toBeUndefined();
    expect(contract.protocol.contractFile.isAPublicExport).toBe(false);
  });

  it('pins the export map by digest, and the digest still matches', () => {
    const digest = createHash('sha256')
      .update(
        JSON.stringify(
          Object.keys(protocolPackage.exports)
            .sort()
            .map((key) => [key, protocolPackage.exports[key]]),
        ),
      )
      .digest('hex');
    expect(contract.protocol.exportMapDigest).toBe(digest);
  });

  it('carries the founder-authorized candidate identity', () => {
    // Pinned as a literal on purpose. Each candidate identity is separately
    // founder-authorized (RELEASE_AUTHORITY.md), so the identity must never
    // drift as a side effect of an ordinary change -- moving this line is a
    // deliberate act that belongs in the same commit as the authorization
    // record. 0.2.0-rc.0 -> 0.2.0-rc.1 was P0-CANON-02; 0.2.0-rc.1 ->
    // 0.2.0-rc.2 was SOBE-SEC-01F.
    const AUTHORIZED_CANDIDATE = '0.2.0-rc.2';
    expect(contract.protocol.version).toBe(AUTHORIZED_CANDIDATE);
    expect(contract.protocol.distribution.candidateIdentity).toBe(AUTHORIZED_CANDIDATE);
    expect(contract.protocol.distribution.prereleaseFamily).toBe('rc');
    // The contract must describe the package that actually ships, not a
    // version someone forgot to update alongside it.
    expect(contract.protocol.version).toBe(protocolPackage.version);
    expect(contract.protocol.distribution.artifactName).toBe(
      `aoc-protocol-${AUTHORIZED_CANDIDATE}.tgz`,
    );
    // Authorization covers the candidate identity only — not publication.
    expect(protocolPackage.private).toBe(true);
    expect(contract.protocol.distribution.registryPublication).toMatch(/not performed/i);
  });

  it('keeps every burned candidate on the record rather than quietly dropping it', () => {
    // 0.2.0-rc.0 was abandoned because canonicalizeJSON could map distinct
    // numeric inputs onto identical canonical bytes, and therefore identical
    // digests (UG-003). Three consumers vendored those bytes by checksum.
    // 0.2.0-rc.1 was abandoned for the SOBE-SEC-01 issuer-binding defect. A
    // superseded candidate that vanishes from the contract is how a consumer
    // ends up unable to tell a burned pin from a current one, so an identity
    // move pushes the previous update onto the history instead of replacing it.
    const burnedById = new Map<string, Record<string, any>>();
    for (const update of [contract.lastMetadataUpdate, ...(contract.previousMetadataUpdates ?? [])]) {
      const burned = update?.burnedCandidate;
      expect(burned).toBeDefined();
      expect(typeof burned.reason).toBe('string');
      expect(burned.reason.length).toBeGreaterThan(0);
      expect(burned.identity).not.toBe(contract.protocol.distribution.candidateIdentity);
      burnedById.set(burned.identity, burned);
    }
    expect(contract.lastMetadataUpdate.burnedCandidate.identity).toBe('0.2.0-rc.1');
    expect(burnedById.get('0.2.0-rc.0')?.sha256).toBe(
      'dbe8a08f432a0324ad34eb7cb85054b6dcd23c0d9a073914edf23fccd10445e5',
    );
    expect(burnedById.get('0.2.0-rc.1')?.sha256).toBe(
      'b0d6ee6ff2010c4addab0bd683e2a89b9b2246f430c7e892fdc3d4123f3a3f60',
    );
  });

  it('classifies the contractVersion bump as metadata-only, because the export set held', () => {
    // changeControl: an identity move with an unchanged export set is
    // editorialOrMetadataOnly -> patch. If the export map digest ever moves in
    // the same breath as an identity change, this is the wrong classification
    // and the contract needs a minor or major instead.
    expect(contract.contractVersion).toBe('1.0.2');
    expect(contract.lastMetadataUpdate?.contractVersion).toBe(contract.contractVersion);
    expect(contract.lastMetadataUpdate?.classification).toBe('editorialOrMetadataOnly');
    expect(contract.changeControl.editorialOrMetadataOnly).toMatch(/patch/i);
    // The frozen export surface, restated here so the classification is
    // checked against the fact rather than against itself.
    expect(contract.protocol.exportMapDigest).toBe(
      'a67d65b17dcb34c7da84d9a07cb893e073e21e9edbbc621bcae649afa5cdeb45',
    );
  });

  it('forbids the install forms that would defeat independent packaging', () => {
    const forbidden: string[] = contract.installForms.forbidden;
    expect(forbidden.some((form) => form.includes('workspace:'))).toBe(true);
    expect(forbidden.some((form) => form.includes('file:'))).toBe(true);
    expect(contract.installForms.allowed.length).toBeGreaterThan(0);
  });

  it('records PMFreak\'s repository-local copies as the state being migrated away from', () => {
    expect(contract.pmfreak.currentDeclaration['@aoc/protocol']).toBe('file:src/aoc/protocol');
    expect(contract.pmfreak.currentDeclaration['@aoc-enterprise/runtime']).toBe('file:src/aoc/enterprise');
    expect(contract.pmfreak.obligations.length).toBeGreaterThan(0);
  });

  it('does not claim to produce the Enterprise runtime artifact', () => {
    expect(contract.enterprise.producesForPmfreak.producedByThisRepository).toBe(false);
    expect(['unresolved', 'resolved']).toContain(contract.enterprise.producesForPmfreak.status);
    if (contract.enterprise.producesForPmfreak.status === 'unresolved') {
      expect(typeof contract.enterprise.producesForPmfreak.note).toBe('string');
      expect(contract.enterprise.producesForPmfreak.note.length).toBeGreaterThan(0);
    }
  });

  it('points at a normative document that exists', () => {
    expect(contract.normativeDocument).toBe('docs/integration/CROSS_REPO_INTEGRATION_CONTRACT.md');
    expect(existsSync(join(repositoryRoot, contract.normativeDocument))).toBe(true);
  });
});
