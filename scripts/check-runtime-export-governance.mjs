import fs from 'node:fs';

const read = (relPath) => fs.readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8');

// Rules match code, not prose: block comments and whole-line / trailing `//` comments are
// removed first so that a docblock may explain what is forbidden without tripping the gate.
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|\s)\/\/.*$/gm, '$1');
const readCode = (relPath) => stripComments(read(relPath));

const runtimeIndex = readCode('runtime/index.ts');
const disallowedPublicExports = [
  "export * from './governance'",
  "export * from './distributed'",
  "export * from './capabilities'",
  "export * from './attestations'",
  "export * from './execution-fabric'",
  "export * from './sovereign-runtime'",
  "export * from './marketplace'",
  // Revocation-safety (see docs/security/revocation/14-independent-review.md): the HMAC
  // capability-token authorization path has no revocation check. Must not be re-exported from
  // the stable surface until it has one.
  "export * from './enforcement'",
  "export { createRuntimeServer }",
  "export * from './api/server'",
  // SOBE-SEC-03J: the two functions of the disabled HMAC path, by name, in case they are
  // re-exported under any other form.
  'enforceCapabilityAccess',
  'authorizeWithCapability',
];

const violations = disallowedPublicExports.filter((entry) => runtimeIndex.includes(entry)).map((entry) => `runtime/index.ts: ${entry}`);

// SOBE-SEC-03J — the HMAC capability token-use path is disabled and must stay that way:
// `authorizeWithCapability` never allows and is off the `protocol/consent` barrel;
// `enforceCapabilityAccess` has no soft mode, always denies, and is exported from no surface.
// Each rule names a file, strings it must not contain and strings it must contain.
const hmacPathRules = [
  { file: 'protocol/consent/capability-index.ts', forbid: ['authorizeWithCapability', 'capability-authorize'], require: [] },
  { file: 'protocol/consent/index.ts', forbid: ['authorizeWithCapability', 'capability-authorize'], require: [] },
  { file: 'protocol/consent/capability-authorize.ts', forbid: ['allowed: true'], require: ['CAPABILITY_PATH_DISABLED'] },
  { file: 'runtime/enforcement/index.ts', forbid: ['enforceCapabilityAccess', 'export *', 'export {'], require: ['export type {'] },
  { file: 'runtime/enforcement/enforceCapability.ts', forbid: ["'soft'", 'allowed: true', 'CAPABILITY_SOFT_ALLOW_MISSING'], require: ["export type EnforcementMode = 'strict'", 'CAPABILITY_MISSING'] },
  { file: 'runtime/api/server.ts', forbid: ["'soft'", "=== 'soft'"], require: [] },
  { file: 'index.ts', forbid: ['authorizeWithCapability', 'enforceCapabilityAccess', 'capability-authorize', "from './runtime/enforcement'"], require: [] },
];

for (const rule of hmacPathRules) {
  const source = readCode(rule.file);
  for (const needle of rule.forbid) {
    if (source.includes(needle)) violations.push(`${rule.file}: must not contain ${JSON.stringify(needle)}`);
  }
  for (const needle of rule.require) {
    if (!source.includes(needle)) violations.push(`${rule.file}: must contain ${JSON.stringify(needle)}`);
  }
}

const packageJson = JSON.parse(read('package.json'));
const requiredExports = ['.', './runtime', './runtime/internal', './runtime/experimental'];
const missingExports = requiredExports.filter((key) => !packageJson.exports || !(key in packageJson.exports));

if (violations.length || missingExports.length) {
  console.error('Runtime export governance violations detected.');
  if (violations.length) {
    console.error('Disallowed or missing content:');
    for (const violation of violations) console.error(` - ${violation}`);
  }
  if (missingExports.length) {
    console.error('Missing package.json exports keys:');
    for (const key of missingExports) console.error(` - ${key}`);
  }
  process.exit(1);
}

console.log(`Runtime export governance checks passed (${disallowedPublicExports.length} stable-surface rules, ${hmacPathRules.length} HMAC-path files).`);
