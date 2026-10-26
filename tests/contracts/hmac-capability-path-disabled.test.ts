/**
 * SOBE-SEC-03J — the HMAC capability token-use path is disabled and fails closed.
 *
 * The independent review (HUNT-7i) showed that the path's only caller executes under
 * transpile-only toolchains despite its type errors, and that `soft` mode allowed a request
 * with no token. These tests assert, under Jest and again through a transpile-only loader in a
 * plain child Node process:
 * - `authorizeWithCapability` never allows: a valid, exactly matching token is denied with
 *   `CAPABILITY_PATH_DISABLED`; invalid and mismatched tokens keep their precise denial codes;
 * - `enforceCapabilityAccess` denies with no token (`CAPABILITY_MISSING`) and with a valid
 *   token (`CAPABILITY_DENIED`), in strict mode and when a caller forces the removed `soft` mode;
 * - neither function is reachable from the `protocol/consent` barrel or `runtime/enforcement`;
 * - `createRuntimeServer` refuses a soft configuration (checked in the child process: the server
 *   module carries pre-existing baseline type errors, so ts-jest cannot import it directly);
 * - the export-governance gate passes and is wired into `check:aoc-boundaries`.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as consentBarrel from '../../protocol/consent';
import * as enforcementBarrel from '../../runtime/enforcement';
import { authorizeWithCapability } from '../../protocol/consent/capability-authorize';
import { CAPABILITY_REASON_CODES, type CapabilityToken } from '../../protocol/consent/capability-types';
import { enforceCapabilityAccess, type CapabilityRequestContext, type EnforcementMode } from '../../runtime/enforcement/enforceCapability';
import { CONSENT_DECISION_REASON_CODES, issueCapabilityToken, type ConsentRecord, type ConsentRequest } from '../../protocol/consent';
import { createStaticRevocationCheck, verifiedNotRevokedStatus } from '../../protocol/revocation';
import { signTestConsentRecord, testSubjectSigner } from '../helpers/consentSigning';

const REPO = join(__dirname, '..', '..');
const SECRET = 'test-secret-03j';
const SUBJECT_ID = testSubjectSigner('03j-subject').did;

const request: ConsentRequest = {
  subject_id: SUBJECT_ID,
  requester_id: 'requester-03j',
  resource: '/data/access',
  action: 'execute',
  requested_at: '2026-05-01T00:00:00.000Z',
};

const consent: ConsentRecord = signTestConsentRecord({
  consent_id: 'consent-03j',
  subject_id: SUBJECT_ID,
  requester_id: 'requester-03j',
  resource: '/data/access',
  actions: ['execute'],
  granted: true,
  created_at: '2026-01-01T00:00:00.000Z',
  expires_at: '2099-12-31T00:00:00.000Z',
  revoked_at: null,
  consent_hash: 'consent-hash-03j',
});

const notRevoked = { checkRevocation: createStaticRevocationCheck(verifiedNotRevokedStatus({ subjectId: 'consent-03j', subjectType: 'consent_grant' })) };

function validToken(): CapabilityToken {
  return issueCapabilityToken(
    {
      consent,
      request,
      decision: { allowed: true, reason_code: CONSENT_DECISION_REASON_CODES.ALLOW, evaluated_at: request.requested_at, consent_id: consent.consent_id },
    },
    SECRET,
    notRevoked
  );
}

function context(overrides: Partial<CapabilityRequestContext> = {}): CapabilityRequestContext {
  return {
    endpoint: request.resource,
    headers: {},
    payload: { subject_hash: request.subject_id, consumer_id: request.requester_id },
    subject_id: request.subject_id,
    requester_id: request.requester_id,
    mode: 'strict',
    capabilitySecret: SECRET,
    ...overrides,
  };
}

// The removed mode, as a JavaScript caller (or a stale configuration) could still pass it.
const SOFT = 'soft' as unknown as EnforcementMode;

describe('authorizeWithCapability never allows', () => {
  it('control: the fixture token is well-formed (shape, hash, signature) and exactly matches the request', () => {
    const token = validToken();
    expect(consentBarrel.validateCapabilityToken(token, SECRET)).toEqual({ valid: true, reason_code: CAPABILITY_REASON_CODES.VALID });
    expect(token.subject_id).toBe(request.subject_id);
    expect(token.requester_id).toBe(request.requester_id);
    expect(token.resource).toBe(request.resource);
    expect(token.action).toBe(request.action);
  });

  it('denies a valid, exactly matching token with CAPABILITY_PATH_DISABLED', () => {
    const token = validToken();
    const result = authorizeWithCapability(request, token, SECRET);
    expect(result.allowed).toBe(false);
    expect(result.reason_code).toBe(CAPABILITY_REASON_CODES.CAPABILITY_PATH_DISABLED);
    expect(result.capability_id).toBe(token.capability_id);
  });

  it('keeps precise denial codes for invalid and mismatched tokens', () => {
    const token = validToken();
    expect(authorizeWithCapability(request, { ...token, signature: 'tampered' }, SECRET).reason_code).toBe(CAPABILITY_REASON_CODES.DENY_INVALID_CAPABILITY);
    expect(authorizeWithCapability(request, token, 'wrong-secret').reason_code).toBe(CAPABILITY_REASON_CODES.DENY_INVALID_CAPABILITY);
    expect(authorizeWithCapability({ ...request, requester_id: 'someone-else' }, token, SECRET).reason_code).toBe(CAPABILITY_REASON_CODES.REQUESTER_MISMATCH);
    expect(authorizeWithCapability({ ...request, resource: '/payout/execute' }, token, SECRET).reason_code).toBe(CAPABILITY_REASON_CODES.RESOURCE_MISMATCH);
    expect(authorizeWithCapability({ ...request, action: 'read' }, token, SECRET).reason_code).toBe(CAPABILITY_REASON_CODES.ACTION_MISMATCH);
    expect(authorizeWithCapability(request, undefined, SECRET).reason_code).toBe(CAPABILITY_REASON_CODES.DENY_INVALID_CAPABILITY);
  });

  it('is not exported from the protocol/consent barrel', () => {
    expect((consentBarrel as Record<string, unknown>).authorizeWithCapability).toBeUndefined();
    expect(consentBarrel.CAPABILITY_REASON_CODES.CAPABILITY_PATH_DISABLED).toBe('CAPABILITY_PATH_DISABLED');
  });
});

describe('enforceCapabilityAccess always denies', () => {
  it('denies a request with no token in strict mode (CAPABILITY_MISSING, 403)', () => {
    const result = enforceCapabilityAccess(context());
    expect(result).toMatchObject({ allowed: false, reason_code: 'CAPABILITY_MISSING', status_code: 403, token_present: false });
    expect(result.authorization?.reason_code).toBe('DENY_INVALID_CAPABILITY');
    expect(result.auditEvent).toBeDefined();
  });

  it('denies a request with no token when the removed soft mode is forced', () => {
    const result = enforceCapabilityAccess(context({ mode: SOFT }));
    expect(result).toMatchObject({ allowed: false, reason_code: 'CAPABILITY_MISSING', status_code: 403, token_present: false });
    expect(result.reason_code).not.toBe('CAPABILITY_SOFT_ALLOW_MISSING');
  });

  it('denies a valid token carried in the header or the payload (CAPABILITY_DENIED, 403), strict or soft', () => {
    const token = validToken();
    for (const ctx of [
      context({ headers: { 'x-aoc-capability': JSON.stringify(token) } }),
      context({ payload: { capability: token } }),
      context({ payload: { capability_token: token } }),
      context({ payload: { token } }),
      context({ mode: SOFT, payload: { capability: token } }),
    ]) {
      const result = enforceCapabilityAccess(ctx);
      expect(result).toMatchObject({ allowed: false, reason_code: 'CAPABILITY_DENIED', status_code: 403, token_present: true });
      expect(result.authorization?.allowed).toBe(false);
      expect(result.authorization?.reason_code).toBe('CAPABILITY_PATH_DISABLED');
      expect(result.auditEvent).toBeDefined();
    }
  });

  it('is not exported from runtime/enforcement', () => {
    expect((enforcementBarrel as Record<string, unknown>).enforceCapabilityAccess).toBeUndefined();
    expect(Object.keys(enforcementBarrel)).toEqual([]);
  });

  it('the audit event records the denial in the hosted audit shape', () => {
    const result = enforceCapabilityAccess(context({ payload: { capability: validToken() } }));
    expect(result.auditEvent).toMatchObject({ event_type: 'CAPABILITY_DENIED', allowed: false, reason_code: 'CAPABILITY_PATH_DISABLED', resource: request.resource, action: 'execute', metadata: { enforcement_mode: 'strict' } });
  });
});

describe('transpile-only execution (no type checking) still denies', () => {
  it('a child Node process that transpiles the sources without diagnostics gets the same denials', () => {
    const token = validToken();
    const out = execFileSync(
      process.execPath,
      [join(REPO, 'tests', 'contracts', 'fixtures', 'transpile-only-hmac-path.cjs'), JSON.stringify({ request, token, secret: SECRET })],
      { cwd: REPO, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } }
    );
    const report = JSON.parse(out.slice(out.lastIndexOf('\n{') + 1));
    expect(report.authorizeValidToken).toMatchObject({ allowed: false, reason_code: 'CAPABILITY_PATH_DISABLED', capability_id: token.capability_id });
    expect(report.authorizeTamperedToken).toMatchObject({ allowed: false, reason_code: 'DENY_INVALID_CAPABILITY' });
    expect(report.enforceNoTokenStrict).toMatchObject({ allowed: false, reason_code: 'CAPABILITY_MISSING', status_code: 403 });
    expect(report.enforceNoTokenSoft).toMatchObject({ allowed: false, reason_code: 'CAPABILITY_MISSING', status_code: 403 });
    expect(report.enforceValidTokenHeader).toMatchObject({ allowed: false, reason_code: 'CAPABILITY_DENIED', status_code: 403, authorization_reason: 'CAPABILITY_PATH_DISABLED' });
    expect(report.enforceValidTokenPayload).toMatchObject({ allowed: false, reason_code: 'CAPABILITY_DENIED', status_code: 403, authorization_reason: 'CAPABILITY_PATH_DISABLED' });
    expect(report.enforceValidTokenSoft).toMatchObject({ allowed: false, reason_code: 'CAPABILITY_DENIED', status_code: 403, authorization_reason: 'CAPABILITY_PATH_DISABLED' });
    expect(report.barrelExportsAuthorize).toBe('undefined');
    expect(report.enforcementIndexExportsEnforce).toBe('undefined');
  });

  it('createRuntimeServer refuses a soft configuration by dependency or environment and constructs in strict mode', () => {
    const token = validToken();
    const out = execFileSync(
      process.execPath,
      [join(REPO, 'tests', 'contracts', 'fixtures', 'transpile-only-hmac-path.cjs'), JSON.stringify({ request, token, secret: SECRET })],
      { cwd: REPO, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } }
    );
    const report = JSON.parse(out.slice(out.lastIndexOf('\n{') + 1));
    expect(report.serverConstruction.softDependency).toMatch(/always strict/);
    expect(report.serverConstruction.softEnvironment).toMatch(/ENFORCEMENT_MODE/);
    expect(report.serverConstruction.strict).toBe('constructed');
  });
});

describe('export governance gate', () => {
  it('passes and is part of check:aoc-boundaries', () => {
    const out = execFileSync(process.execPath, [join(REPO, 'scripts', 'check-runtime-export-governance.mjs')], { cwd: REPO, encoding: 'utf8' });
    expect(out).toMatch(/Runtime export governance checks passed/);
    const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['check:aoc-boundaries']).toContain('npm run check:runtime-exports');
    expect(pkg.scripts['validate:release']).toContain('npm run check:aoc-boundaries');
  });

  it('fails if the barrel re-exports the authorizer or the soft mode comes back', () => {
    const script = readFileSync(join(REPO, 'scripts', 'check-runtime-export-governance.mjs'), 'utf8');
    expect(script).toContain("'authorizeWithCapability'");
    expect(script).toContain('\'soft\'');
    expect(script).toContain('CAPABILITY_PATH_DISABLED');
    expect(script).toContain('runtime/enforcement/index.ts');
    expect(script).toContain('protocol/consent/capability-index.ts');
  });
});
