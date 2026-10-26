// Executes the HMAC capability path's TypeScript sources with NO type checking: every `.ts` file is
// transpiled on load with `typescript.transpileModule` (diagnostics ignored), the way ts-jest with
// diagnostics off, `ts-node --transpile-only`, `tsx` or esbuild would run it. The independent
// review (HUNT-7i) used this vector to call `enforceCapabilityAccess` despite the file's type
// errors; this fixture lets the contract test prove the path denies under exactly that execution.
//
// Usage: node transpile-only-hmac-path.cjs <json: { request, token, secret }>
// Prints a JSON report of decisions on stdout.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repo = path.resolve(__dirname, '..', '..', '..');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: false,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  module._compile(outputText, filename);
};

const { request, token, secret } = JSON.parse(process.argv[2]);
const { authorizeWithCapability } = require(path.join(repo, 'protocol', 'consent', 'capability-authorize.ts'));
const { enforceCapabilityAccess } = require(path.join(repo, 'runtime', 'enforcement', 'enforceCapability.ts'));
const consentBarrel = require(path.join(repo, 'protocol', 'consent', 'index.ts'));
const enforcementBarrel = require(path.join(repo, 'runtime', 'enforcement', 'index.ts'));
const { createRuntimeServer } = require(path.join(repo, 'runtime', 'api', 'server.ts'));
const { InMemoryApiKeyStore } = require(path.join(repo, 'runtime', 'auth', 'apiKeys.ts'));

// `createRuntimeServer` must refuse a soft configuration, whether passed as a dependency or
// through `ENFORCEMENT_MODE`, and construct in strict mode.
const serverConstruction = {};
try { createRuntimeServer({ apiKeyStore: new InMemoryApiKeyStore(), capabilitySecret: secret, enforcementMode: 'soft' }).close(); serverConstruction.softDependency = 'constructed'; } catch (error) { serverConstruction.softDependency = error.message; }
const previousMode = process.env.ENFORCEMENT_MODE;
process.env.ENFORCEMENT_MODE = 'soft';
try { createRuntimeServer({ apiKeyStore: new InMemoryApiKeyStore(), capabilitySecret: secret }).close(); serverConstruction.softEnvironment = 'constructed'; } catch (error) { serverConstruction.softEnvironment = error.message; }
if (previousMode === undefined) delete process.env.ENFORCEMENT_MODE; else process.env.ENFORCEMENT_MODE = previousMode;
try { createRuntimeServer({ apiKeyStore: new InMemoryApiKeyStore(), capabilitySecret: secret, enforcementMode: 'strict' }).close(); serverConstruction.strict = 'constructed'; } catch (error) { serverConstruction.strict = error.message; }

const context = (overrides) => ({
  endpoint: request.resource,
  headers: {},
  payload: { subject_hash: request.subject_id, consumer_id: request.requester_id },
  subject_id: request.subject_id,
  requester_id: request.requester_id,
  mode: 'strict',
  capabilitySecret: secret,
  ...overrides,
});

const pick = (r) => ({ allowed: r.allowed, reason_code: r.reason_code, status_code: r.status_code, token_present: r.token_present, authorization_reason: r.authorization && r.authorization.reason_code });

console.log(JSON.stringify({
  authorizeValidToken: authorizeWithCapability(request, token, secret),
  authorizeTamperedToken: authorizeWithCapability(request, { ...token, signature: 'tampered' }, secret),
  enforceNoTokenStrict: pick(enforceCapabilityAccess(context({}))),
  enforceNoTokenSoft: pick(enforceCapabilityAccess(context({ mode: 'soft' }))),
  enforceValidTokenHeader: pick(enforceCapabilityAccess(context({ headers: { 'x-aoc-capability': JSON.stringify(token) } }))),
  enforceValidTokenPayload: pick(enforceCapabilityAccess(context({ payload: { capability: token } }))),
  enforceValidTokenSoft: pick(enforceCapabilityAccess(context({ mode: 'soft', payload: { capability: token } }))),
  barrelExportsAuthorize: typeof consentBarrel.authorizeWithCapability,
  enforcementIndexExportsEnforce: typeof enforcementBarrel.enforceCapabilityAccess,
  serverConstruction,
}));
