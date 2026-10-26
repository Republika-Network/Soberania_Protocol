#!/usr/bin/env node
// Packaging gate (SOBE-SEC-03D): every workspace package must execute its current, reviewed
// build when imported by package name. The runtime packages used to compile to dist/src/ while
// package.json pointed at dist/index.js, so plain Node loaded bootstrap artifacts that lacked the
// consent, capability and integrity checks. Jest and the TypeScript `paths` map package names to
// src/, so no test saw it. This gate checks the packaging surface those mappings bypass:
//
//   1. every declared JavaScript and declaration entry point exists and is tracked by git;
//   2. no compiled file sits beside the sources (src/) and no nested dist/src/ exists;
//   3. a clean `tsc -b` reproduces the committed dist/ outputs exactly;
//   4. a child `node` process (no Jest, no path mappings) loads every workspace by package name,
//      checks that the loaded file is the declared entry and that critical exports exist, and runs
//      security smoke tests through those entry points (capability expiry and namespace isolation,
//      consent signature verification, portable-cognition integrity, issuer-signed identity records,
//      signature binding in the crypto engine).
//
// The root `aoc-runtime` package is reported separately: its `exports` name files that are never
// built, so it is not distribution-ready. The gate records that as a release blocker and never
// certifies it.
//
// Usage: node scripts/check-package-entrypoints.mjs [--smoke-only]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const repo = resolve(dirname(here), '..');
const rootPkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));

/** Compiled files that are genuinely source and may live under src/. */
const SOURCE_DECLARATIONS = new Set(['packages/protocol/src/node-compat.d.ts']);

/** Exports that must be reachable through the package entry point. */
const CRITICAL_EXPORTS = {
  '@aoc-runtime/consent-runtime': ['ConsentRuntime', 'isGrantActive', 'isDelegatedGrant'],
  '@aoc-runtime/capability-runtime': ['CapabilityRuntime'],
  '@aoc-runtime/authorization-runtime': ['AuthorizationRuntime'],
  '@aoc-runtime/portable-cognition': ['IntegrityVerificationRuntime', 'computePortableIntegrity', 'validatePortablePackage'],
  '@aoc-runtime/vault-runtime': ['resolveNamespacePath'],
  '@aoc-runtime/pmfreak-adapter': ['PMFreakAocAdapter'],
  '@aoc-runtime/governance-runtime': ['GovernanceRuntime'],
  '@aoc-runtime/audit-runtime': ['AuditRuntime'],
  '@aoc-runtime/trust-registry-runtime': ['InMemoryTrustService', 'FederatedAuthorityVerifier', 'identityRegistrationPayload', 'DEFAULT_TRUST_ISSUERS'],
  '@aoc-runtime/crypto': ['verifyPayloadSignature', 'createTrustedKeySet', 'signPayload', 'createRuntimeAuthority', 'stableHash', 'snapshotGovernanceSignature'],
  '@aoc/enterprise': ['InMemoryTrustService', 'DEFAULT_TRUST_ISSUERS'],
};

function listWorkspaces() {
  const dirs = [];
  for (const pattern of rootPkg.workspaces ?? []) {
    if (pattern.endsWith('/*')) {
      const base = pattern.slice(0, -2);
      for (const entry of readdirSync(join(repo, base))) {
        if (existsSync(join(repo, base, entry, 'package.json'))) dirs.push(`${base}/${entry}`);
      }
    } else if (existsSync(join(repo, pattern, 'package.json'))) {
      dirs.push(pattern);
    }
  }
  return dirs.sort().map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(repo, dir, 'package.json'), 'utf8')) }));
}

/** Every file path named by main, types and exports (strings at any depth), with the export key that names it. */
function entryTargets(pkg) {
  const targets = [];
  if (typeof pkg.main === 'string') targets.push({ key: 'main', target: pkg.main });
  if (typeof pkg.types === 'string') targets.push({ key: 'types', target: pkg.types });
  const walk = (value, key) => {
    if (typeof value === 'string') targets.push({ key, target: value });
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, key === 'exports' ? k : key);
  };
  walk(pkg.exports, 'exports');
  return targets;
}

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules') continue;
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function git(args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
}

function isTracked(relPath) {
  try {
    git(['ls-files', '--error-unmatch', '--', relPath]);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Child process: plain Node package-name loading and smoke tests. No Jest, no tsconfig paths.
// ---------------------------------------------------------------------------------------------
async function runSmoke() {
  const require = createRequire(join(repo, 'package.json'));
  const workspaces = listWorkspaces().filter(({ pkg }) => pkg.name && pkg.name !== rootPkg.name);
  const results = [];
  const record = (id, ok, detail) => results.push({ id, ok, detail });

  // Load every workspace, and every subpath it exports, by package name.
  for (const { dir, pkg } of workspaces) {
    const subpaths = pkg.exports && typeof pkg.exports === 'object' && !Array.isArray(pkg.exports)
      ? Object.keys(pkg.exports).filter((k) => k.startsWith('./') && k !== './package.json' && !k.includes('*'))
      : [];
    const names = [pkg.name, ...subpaths.map((s) => pkg.name + s.slice(1))];
    for (const name of names) {
      let resolved;
      try {
        resolved = require.resolve(name);
        require(name);
      } catch (error) {
        record(`load ${name}`, false, `cannot load by package name: ${error.code ?? ''} ${String(error.message).split('\n')[0]}`);
        continue;
      }
      const inside = relative(join(repo, dir), resolved);
      if (inside.startsWith('..')) {
        record(`load ${name}`, false, `resolves outside its workspace: ${relative(repo, resolved)}`);
        continue;
      }
      if (/(^|\/)dist\/src\//.test(inside) || /^src\//.test(inside)) {
        record(`load ${name}`, false, `resolves to a stale layout: ${relative(repo, resolved)}`);
        continue;
      }
      record(`load ${name}`, true, relative(repo, resolved));
    }

    // `main`, the "." export and the file Node actually loads must all be the same file.
    const exportMain = pkg.exports?.['.']?.default ?? pkg.exports?.['.']?.require ?? (typeof pkg.exports?.['.'] === 'string' ? pkg.exports['.'] : undefined);
    const declared = [['main', pkg.main], ['exports "."', exportMain]].filter(([, target]) => typeof target === 'string');
    if (declared.length > 0) {
      const paths = new Set(declared.map(([, target]) => resolve(join(repo, dir), target)));
      let actual;
      try { actual = require.resolve(pkg.name); } catch { actual = undefined; }
      const consistent = paths.size === 1 && actual !== undefined && paths.has(actual);
      record(`entry ${pkg.name}`, consistent, consistent
        ? relative(repo, actual)
        : `${declared.map(([key, target]) => `${key} → ${target}`).join(', ')}; loaded ${actual ? relative(repo, actual) : 'nothing'}`);
    }

    const required = CRITICAL_EXPORTS[pkg.name];
    if (required) {
      let mod;
      try { mod = require(pkg.name); } catch { mod = {}; }
      const missing = required.filter((name) => mod[name] === undefined);
      record(`exports ${pkg.name}`, missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : required.join(', '));
    }
  }
  for (const name of Object.keys(CRITICAL_EXPORTS)) {
    if (!workspaces.some(({ pkg }) => pkg.name === name)) record(`exports ${name}`, false, 'package is not a workspace');
  }

  // Security smoke tests through the real entry points. Each one has a positive and a negative case.
  const smoke = async (id, fn) => {
    try {
      const detail = await fn();
      record(id, true, detail);
    } catch (error) {
      record(id, false, String(error && error.message ? error.message : error).split('\n')[0]);
    }
  };
  const assert = (condition, message) => { if (!condition) throw new Error(message); };

  await smoke('smoke capability-runtime: expiry', async () => {
    const { CapabilityRuntime } = require('@aoc-runtime/capability-runtime');
    const scope = { organizationId: 'org:a', path: '/alice' };
    const at = (expiresAt) => new CapabilityRuntime({ resolve: async () => [{ capabilityId: 'c', action: 'read', resource: 'doc', scope, expiresAt }] })
      .evaluate({ actor: { actorId: 'actor:alice', actorType: 'human', organizationId: 'org:a' }, namespace: scope, action: 'read', resource: 'doc', now: '2026-06-01T00:00:00.000Z' });
    const live = await at('2027-01-01T00:00:00.000Z');
    const expired = await at('2026-01-01T00:00:00.000Z');
    assert(live.allowed === true, `live capability denied: ${live.reason}`);
    assert(expired.allowed === false && expired.reason === 'expired_capability', `expired capability not denied: ${JSON.stringify(expired)}`);
    // NEW-1: a timestamp that is not an ISO-8601 string (what DB drivers return) must never read as "live".
    for (const [label, value] of [
      ['Date (past)', new Date('2026-01-01T00:00:00.000Z')],
      ['Date (future)', new Date('2027-01-01T00:00:00.000Z')],
      ['epoch number (past)', Date.parse('2026-01-01T00:00:00.000Z')],
      ['epoch number (future)', Date.parse('2027-01-01T00:00:00.000Z')],
      ['epoch string', String(Date.parse('2027-01-01T00:00:00.000Z'))],
      ['malformed string', 'tomorrow'],
      ['impossible date', '2027-13-45T00:00:00.000Z'],
      ['empty string', ''],
    ]) {
      const decision = await at(value);
      assert(decision.allowed === false && decision.reason === 'expired_capability', `non-ISO expiresAt (${label}) not denied as expired: ${JSON.stringify(decision)}`);
    }
    const badNow = await new CapabilityRuntime({ resolve: async () => [{ capabilityId: 'c', action: 'read', resource: 'doc', scope }] })
      .evaluate({ actor: { actorId: 'actor:alice', actorType: 'human', organizationId: 'org:a' }, namespace: scope, action: 'read', resource: 'doc', now: new Date('2026-06-01T00:00:00.000Z') });
    assert(badNow.allowed === false && badNow.reason === 'denied', `non-ISO evaluation time not denied: ${JSON.stringify(badNow)}`);
    return 'live allowed; expired, Date, epoch, malformed and empty expiresAt denied as expired; non-ISO now denied';
  });

  await smoke('smoke capability-runtime: namespace isolation', async () => {
    const { CapabilityRuntime } = require('@aoc-runtime/capability-runtime');
    const runtime = new CapabilityRuntime({ resolve: async () => [{ capabilityId: 'c', action: 'read', resource: 'doc', scope: { organizationId: 'org:a', path: '/alice' } }] });
    const at = (namespace) => runtime.evaluate({ actor: { actorId: 'actor:alice', actorType: 'human', organizationId: 'org:a' }, namespace, action: 'read', resource: 'doc' });
    assert((await at({ organizationId: 'org:a', path: '/alice/records' })).allowed === true, 'child path denied');
    assert((await at({ organizationId: 'org:a', path: '/alice' })).allowed === true, 'exact path denied');
    assert((await at({ organizationId: 'org:a', path: '/alice-other' })).allowed === false, 'sibling prefix "/alice-other" allowed');
    assert((await at({ organizationId: 'org:b', path: '/alice' })).allowed === false, 'other organization allowed');
    for (const escape of ['/alice/../bob', '/alice/./records', '/alice//records', 'alice/records', '/alice/records/']) {
      assert((await at({ organizationId: 'org:a', path: escape })).allowed === false, `non-canonical path "${escape}" allowed`);
    }
    return '/alice covers /alice and /alice/records only; dot, empty and relative segments denied';
  });

  const crypto = require('@aoc-runtime/crypto');
  const alice = crypto.createRuntimeAuthority('runtime:alice', 'actor:alice', 'authority:alice');
  const bob = crypto.createRuntimeAuthority('runtime:bob', 'actor:bob', 'authority:bob');
  const mallory = crypto.createRuntimeAuthority('runtime:mallory', 'actor:mallory', 'authority:mallory');
  const trustedKeys = crypto.createTrustedKeySet([alice.identity, bob.identity, mallory.identity]);
  const provenance = { runtimeSource: 'check-package-entrypoints', timestamp: '2026-01-01T00:00:00.000Z' };
  const capability = { capabilityId: 'cap:records', action: 'read', resource: 'records', scope: { organizationId: 'org:a', path: '/alice' } };
  const grant = { grantId: 'g:own', subjectActorId: 'actor:alice', capability, issuedAt: '2026-01-01T00:00:00.000Z' };
  const AT = '2026-02-01T00:00:00.000Z';
  const issue = (g, signer = alice) => {
    const grantHash = crypto.stableHash(g);
    return { grant: g, grantHash, issuerSignature: crypto.signPayload({ grantHash, grant: g }, signer.privateKey, signer.identity, provenance) };
  };

  await smoke('smoke consent-runtime: signature verification', async () => {
    const { ConsentRuntime } = require('@aoc-runtime/consent-runtime');
    let threw = false;
    try { new ConsentRuntime({ getActiveGrants: async () => [] }, {}); } catch { threw = true; }
    assert(threw, 'ConsentRuntime constructed without trusted keys');
    threw = false;
    try { new ConsentRuntime({ getActiveGrants: async () => [] }, { trustedKeys }); } catch { threw = true; }
    assert(threw, 'ConsentRuntime constructed without a resource ownership provider');
    const decide = (grants, actorId = 'actor:alice', owner = 'actor:alice') =>
      new ConsentRuntime({ getActiveGrants: async () => grants }, { trustedKeys, resourceOwnership: { ownerOf: async () => owner } }).evaluate({ actorId, capability, at: AT });
    const malloryOwn = { ...grant, grantId: 'g:mallory', subjectActorId: 'actor:mallory' };
    assert((await decide([issue(malloryOwn, mallory)], 'actor:mallory')).allowed === false, 'self-signed grant by a non-owner allowed over the owner\'s resource');
    assert((await decide([issue(grant)], 'actor:alice', null)).allowed === false, 'grant allowed while ownership is not established');
    assert((await decide([issue(grant)])).allowed === true, 'subject-signed grant denied');
    assert((await decide([{ grant, grantHash: crypto.stableHash(grant) }])).allowed === false, 'unsigned grant allowed');
    assert((await decide([issue(grant, mallory)])).allowed === false, 'grant signed by another trusted key allowed');
    const tampered = issue(grant);
    tampered.grant = { ...grant, capability: { ...capability, action: 'write' } };
    assert((await decide([tampered], 'actor:alice')).allowed === false, 'tampered grant allowed');
    const delegated = { ...grant, grantId: 'g:delegated', delegateActorId: 'actor:bob' };
    assert((await decide([issue(delegated)], 'actor:bob')).allowed === false, 'delegated grant without delegate signature allowed');
    const runtime = new ConsentRuntime({ getActiveGrants: async () => [] }, { trustedKeys, resourceOwnership: { ownerOf: async () => 'actor:alice' } });
    const countersigned = runtime.signDelegation(issue(delegated), bob.privateKey, bob.identity, 'check-package-entrypoints');
    assert((await decide([countersigned], 'actor:bob')).allowed === true, 'countersigned delegated grant denied');
    assert((await decide([countersigned], 'actor:mallory')).allowed === false, 'delegated grant allowed for a third actor');
    return 'owner-signed allowed; unsigned, mis-signed, tampered, un-countersigned, non-owner and unknown-owner denied';
  });

  await smoke('smoke consent-runtime: timestamp types', async () => {
    // NEW-1: revocation/expiry markers and the evaluation time must be ISO-8601 strings; a Date
    // object or an epoch number must deny (revoked/expired/denied), never be ignored.
    const { ConsentRuntime, isGrantActive } = require('@aoc-runtime/consent-runtime');
    const decide = (grants, at = AT) =>
      new ConsentRuntime({ getActiveGrants: async () => grants }, { trustedKeys, resourceOwnership: { ownerOf: async () => 'actor:alice' } }).evaluate({ actorId: 'actor:alice', capability, at });
    const signed = issue(grant);
    const sibling = issue({ ...grant, grantId: 'g:second', issuedAt: '2026-01-02T00:00:00.000Z' });
    const marker = (fields) => ({ ...signed, grant: { ...signed.grant, ...fields } });
    const revokedIso = '2026-01-20T00:00:00.000Z';
    assert((await decide([signed])).allowed === true, 'control: signed grant denied');
    assert((await decide([marker({ revokedAt: revokedIso }), signed])).reason === 'revoked', 'control: string revocation marker ignored');
    for (const [label, value] of [['Date', new Date(revokedIso)], ['epoch number', Date.parse(revokedIso)], ['malformed', 'last week'], ['empty', '']]) {
      assert((await decide([marker({ revokedAt: value }), signed])).reason === 'revoked', `${label} revokedAt marker beside the signed original not treated as revoked`);
      assert((await decide([marker({ revokedAt: value }), sibling])).reason === 'revoked', `${label} revokedAt marker beside a sibling grant not treated as revoked`);
    }
    for (const [label, value] of [['Date', new Date('2027-01-01T00:00:00.000Z')], ['epoch number', Date.parse('2027-01-01T00:00:00.000Z')], ['malformed', 'never']]) {
      assert((await decide([marker({ expiresAt: value }), signed])).reason === 'expired', `${label} expiresAt not treated as expired`);
      assert(isGrantActive({ ...grant, expiresAt: value }, AT) === false, `isGrantActive: ${label} expiresAt read as live`);
    }
    assert(isGrantActive({ ...grant, issuedAt: new Date(grant.issuedAt) }, AT) === false, 'isGrantActive: Date issuedAt read as usable');
    assert(isGrantActive(grant, new Date(AT)) === false, 'isGrantActive: Date evaluation time accepted');
    assert(isGrantActive({ ...grant, expiresAt: '2026-02-01T00:00:00Z' }, AT) === false, 'isGrantActive: expiry equal to the evaluation instant (no milliseconds) read as live');
    assert((await decide([signed], new Date(AT))).reason === 'denied', 'non-ISO evaluation time not denied');
    assert((await decide([signed], Date.parse(AT))).reason === 'denied', 'epoch evaluation time not denied');
    return 'Date/epoch/malformed revokedAt → revoked, expiresAt → expired, issuedAt/at → unusable; ISO controls unchanged';
  });

  await smoke('smoke authorization-runtime: end to end', async () => {
    const { AuthorizationRuntime } = require('@aoc-runtime/authorization-runtime');
    const { CapabilityRuntime } = require('@aoc-runtime/capability-runtime');
    const { ConsentRuntime } = require('@aoc-runtime/consent-runtime');
    const { AuditRuntime } = require('@aoc-runtime/audit-runtime');
    const governance = { evaluate: async () => ({ allowed: true, reasons: [], policySourceIds: [], inheritedScopeChain: [] }) };
    const input = {
      actor: { actorId: 'actor:alice', actorType: 'human', organizationId: 'org:a' },
      namespace: { organizationId: 'org:a', path: '/alice/records' },
      scope: { scopeId: 'scope:a', namespace: { organizationId: 'org:a', path: '/alice' }, allowedActorTypes: ['human'] },
      action: 'read', resource: 'records', at: AT,
    };
    const authorize = (grants) => new AuthorizationRuntime(
      governance,
      new CapabilityRuntime({ resolve: async () => [capability] }),
      new ConsentRuntime({ getActiveGrants: async () => grants }, { trustedKeys, resourceOwnership: { ownerOf: async () => 'actor:alice' } }),
      new AuditRuntime()
    ).evaluate(input);
    assert((await authorize([issue(grant)])).allowed === true, 'signed grant denied end to end');
    const denied = await authorize([issue(grant, mallory)]);
    assert(denied.allowed === false && denied.failedStage === 'consent', `mis-signed grant not denied at consent: ${JSON.stringify(denied)}`);
    return 'signed grant allowed, mis-signed grant denied at the consent stage';
  });

  await smoke('smoke pmfreak-adapter: constructs with trusted keys and denies without grants', async () => {
    const { PMFreakAocAdapter } = require('@aoc-runtime/pmfreak-adapter');
    const adapter = new PMFreakAocAdapter({
      capabilities: { resolve: async () => [capability] },
      policies: { getPolicies: async () => [] },
      consent: { getActiveGrants: async () => [] },
      consentTrustedKeys: trustedKeys,
      resourceOwnership: { ownerOf: async () => 'actor:alice' },
      audit: { append: async () => {} },
    });
    const allowed = await adapter.evaluateAction({
      actor: { actorId: 'actor:alice', actorType: 'human', organizationId: 'org:a' },
      namespace: { organizationId: 'org:a', path: '/alice/records' },
      scope: { scopeId: 'scope:a', namespace: { organizationId: 'org:a', path: '/alice' }, allowedActorTypes: ['human'] },
      action: 'read', resource: 'records', at: AT,
    });
    assert(allowed === false, 'adapter allowed an action with no consent grant');
    return 'denied with no grants';
  });

  await smoke('smoke portable-cognition: integrity', async () => {
    const { IntegrityVerificationRuntime, computePortableIntegrity, validatePortablePackage } = require('@aoc-runtime/portable-cognition');
    const base = {
      packageId: 'pkg:1', sourceOrganizationId: 'org:a', exportedAt: '2026-01-01T00:00:00.000Z',
      topology: { namespaces: [{ organizationId: 'org:a', path: '/alice' }], actorBindings: [] },
      governanceSnapshot: { policies: [], capabilities: [capability], consentGrants: [] },
      auditContinuity: { chainId: 'chain:1', lastEventHash: 'h', events: [] },
    };
    const integrity = computePortableIntegrity(base);
    assert(integrity.packageHash === computePortableIntegrity(base).packageHash, 'integrity is not deterministic');
    // Wire form: JSON drops the optional hashes that are undefined.
    const signed = JSON.parse(JSON.stringify({ ...base, integrity }));
    const tampered = { ...signed, governanceSnapshot: { ...signed.governanceSnapshot, capabilities: [] } };
    const verdict = validatePortablePackage(tampered);
    assert(verdict.valid === false && verdict.errors.includes('governance_hash_mismatch'), `tampered governance snapshot not detected: ${JSON.stringify(verdict)}`);
    const runtime = new IntegrityVerificationRuntime(trustedKeys);
    assert(runtime.verifyExportIntegrity(base) === false, 'package without integrity verified');
    assert(runtime.verifyExportIntegrity(tampered) === false, 'tampered package verified');
    assert(runtime.verifyConsentGrant(issue(grant)) === true, 'signed grant failed verification');
    const forged = issue(grant);
    forged.grant = { ...grant, subjectActorId: 'actor:mallory' };
    assert(runtime.verifyConsentGrant(forged) === false, 'tampered grant verified');
    assert(runtime.verifyConsentGrant({ grant, grantHash: crypto.stableHash(grant) }) === false, 'unsigned grant verified');
    return 'tampered snapshot and unsigned/tampered grants rejected, signed grant verified';
  });

  await smoke('smoke trust-registry / enterprise: issuer-signed identity records', async () => {
    const trust = require('@aoc-runtime/trust-registry-runtime');
    const enterprise = require('@aoc/enterprise');
    assert(enterprise.InMemoryTrustService === trust.InMemoryTrustService, 'enterprise and trust-registry expose different InMemoryTrustService classes');
    const issuer = crypto.createRuntimeAuthority('runtime:kyc-global', 'kyc-global-v1');
    const impostor = crypto.createRuntimeAuthority('runtime:impostor', 'issuer:impostor');
    const trustedIssuerKeys = crypto.createTrustedKeySet([issuer.identity, impostor.identity]);
    const credential = { credential_ref: 'cred:1', subject_hash: 'subject:1', issuer_id: 'kyc-global-v1', credential_hash: 'x', metadata_hash: 'y', kyc_level: 'institutional', issued_at: '2026-01-01T00:00:00.000Z' };
    const consent = { consent_id: 'consent:1', subject_hash: 'subject:1', consumer_id: 'consumer:1', issuer_id: 'kyc-global-v1', granted_at: '2026-01-01T00:00:00.000Z' };
    const sign = (kind, record, by = issuer) => ({ ...record, issuer_signature: crypto.signPayload(trust.identityRegistrationPayload(kind, record), by.privateKey, by.identity, provenance) });
    const verifyInput = { subject_hash: 'subject:1', consumer_id: 'consumer:1', now: new Date('2026-02-01T00:00:00.000Z') };
    const good = new trust.InMemoryTrustService(trust.DEFAULT_TRUST_ISSUERS, { trustedIssuerKeys });
    good.registerCredential(sign('credential', credential));
    good.grantConsent(sign('consent', consent));
    assert(good.verifyIdentity(verifyInput).valid === true, 'issuer-signed records not verified');
    const refuses = (fn) => { try { fn(); return false; } catch { return true; } };
    const strict = new trust.InMemoryTrustService(trust.DEFAULT_TRUST_ISSUERS, { trustedIssuerKeys });
    assert(refuses(() => strict.registerCredential({ ...credential })), 'unsigned credential accepted');
    assert(refuses(() => strict.registerCredential(sign('credential', credential, impostor))), 'credential signed by another issuer accepted');
    assert(refuses(() => strict.registerCredential({ ...sign('credential', credential), kyc_level: 'basic' })), 'altered credential accepted');
    assert(refuses(() => new trust.InMemoryTrustService(trust.DEFAULT_TRUST_ISSUERS).registerCredential(sign('credential', credential))), 'registration accepted with no issuer keys configured');
    assert(strict.verifyIdentity(verifyInput).valid === false, 'identity verified without registered records');
    return 'signed accepted; unsigned, impostor-signed, altered and keyless refused';
  });

  await smoke('smoke crypto: signatures bind payload and key', async () => {
    const envelope = crypto.signPayload({ x: 1 }, alice.privateKey, alice.identity, provenance);
    assert(crypto.verifyPayloadSignature({ x: 1 }, envelope, trustedKeys) === true, 'valid signature rejected');
    assert(crypto.verifyPayloadSignature({ x: 2 }, envelope, trustedKeys) === false, 'tampered payload verified');
    assert(crypto.verifyPayloadSignature({ x: 1 }, envelope, crypto.createTrustedKeySet([bob.identity])) === false, 'signature verified against an unrelated key set');
    return 'valid accepted, tampered and untrusted rejected';
  });

  process.stdout.write(JSON.stringify(results));
}

// ---------------------------------------------------------------------------------------------
// Parent process: filesystem, git and build checks, then the child run.
// ---------------------------------------------------------------------------------------------
function main() {
  const failures = [];
  const ok = (message) => console.log(`  ok   ${message}`);
  const fail = (message) => { failures.push(message); console.log(`  FAIL ${message}`); };
  const smokeOnly = process.argv.includes('--smoke-only');
  const workspaces = listWorkspaces().filter(({ pkg }) => pkg.name !== rootPkg.name);

  if (!smokeOnly) {
    console.log('[check:package-entrypoints] 1. declared entry points exist and are tracked');
    for (const { dir, pkg } of workspaces) {
      for (const { key, target } of entryTargets(pkg)) {
        if (!/\.(c?js|mjs|d\.ts|json)$/.test(target)) continue;
        const relPath = join(dir, target);
        if (!existsSync(join(repo, relPath))) fail(`${pkg.name}: ${key} → ${target} does not exist`);
        else if (!isTracked(relPath)) fail(`${pkg.name}: ${key} → ${target} is not tracked by git`);
      }
    }
    if (failures.length === 0) ok(`${workspaces.length} workspaces, every main/types/exports target exists and is tracked`);

    console.log('[check:package-entrypoints] 2. no stale compiled files under src/ or dist/src/');
    let stale = 0;
    for (const { dir, pkg } of workspaces) {
      for (const file of walkFiles(join(repo, dir, 'src'))) {
        const relPath = relative(repo, file);
        if (/\.(c?js|mjs|js\.map|d\.ts|d\.ts\.map)$/.test(relPath) && !SOURCE_DECLARATIONS.has(relPath)) { stale += 1; fail(`${pkg.name}: compiled file beside sources: ${relPath}`); }
      }
      if (existsSync(join(repo, dir, 'dist', 'src'))) { stale += 1; fail(`${pkg.name}: nested dist/src/ exists (outputs must be emitted with rootDir "src")`); }
    }
    if (stale === 0) ok('no compiled files under src/, no dist/src/ directories');

    console.log('[check:package-entrypoints] 3. a clean build reproduces the committed dist/ outputs');
    try {
      execFileSync(process.execPath, [join(repo, 'node_modules', 'typescript', 'bin', 'tsc'), '-b'], { cwd: repo, stdio: 'inherit' });
      // The fresh build must equal the staged dist/ content (what is, or is about to be, committed):
      // no modified or deleted tracked files, and no untracked outputs the build produced.
      const distDirs = workspaces.map(({ dir }) => join(dir, 'dist')).filter((d) => existsSync(join(repo, d)));
      const modified = git(['diff', '--name-status', '--', ...distDirs]).trim();
      const untracked = git(['ls-files', '--others', '--exclude-standard', '--', ...distDirs]).trim();
      const dirty = [modified, untracked.split('\n').filter(Boolean).map((f) => `?\t${f}`).join('\n')].filter(Boolean).join('\n');
      if (dirty) fail(`staged dist/ differs from a fresh build:\n${dirty.split('\n').map((line) => `         ${line}`).join('\n')}`);
      else ok(`tsc -b reproduced the staged content of ${distDirs.length} dist/ directories`);
    } catch (error) {
      fail(`build failed: ${String(error.message).split('\n')[0]}`);
    }
  }

  console.log('[check:package-entrypoints] 4. plain Node package-name loading and security smoke tests');
  let results = [];
  try {
    const out = execFileSync(process.execPath, [here, '--smoke'], { cwd: repo, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' }, maxBuffer: 16 * 1024 * 1024 });
    results = JSON.parse(out.slice(out.lastIndexOf('[{')));
  } catch (error) {
    fail(`smoke child process failed: ${String(error.stderr || error.message).split('\n').slice(0, 3).join(' | ')}`);
  }
  for (const result of results) {
    if (result.ok) ok(`${result.id}: ${result.detail}`);
    else fail(`${result.id}: ${result.detail}`);
  }
  const smokeCount = results.filter((r) => r.id.startsWith('smoke ')).length;
  if (smokeCount < 8) fail(`expected at least 8 smoke tests to run, saw ${smokeCount}`);

  console.log(`[check:package-entrypoints] root package "${rootPkg.name}": NOT CERTIFIED (release blocker)`);
  const rootTargets = entryTargets(rootPkg).filter(({ target }) => /\.(c?js|mjs|d\.ts)$/.test(target));
  const unbuilt = rootTargets.filter(({ target }) => !existsSync(join(repo, target)));
  console.log(`         ${unbuilt.length}/${rootTargets.length} declared targets are never built: ${unbuilt.map((t) => t.target).join(', ')}`);
  console.log('         The root modules (vault/, consent/, protocol/, interpreter/, runtime/) run only as TypeScript source. This gate does not certify the root package.');
  if (rootPkg.private !== true) fail('root package must stay private:true while its exports are unbuilt');

  console.log(failures.length === 0
    ? `[check:package-entrypoints] PASSED — ${workspaces.length} workspace packages execute their committed build by package name`
    : `[check:package-entrypoints] FAILED — ${failures.length} problem(s)`);
  process.exit(failures.length === 0 ? 0 : 1);
}

if (process.argv.includes('--smoke')) {
  runSmoke().catch((error) => { console.error(error); process.exit(2); });
} else {
  main();
}
