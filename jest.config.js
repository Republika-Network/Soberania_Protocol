module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }]
  },
  testMatch: [
    '<rootDir>/tests/contracts/**/*.test.ts',
    '<rootDir>/__tests__/contracts/**/*.test.ts',
    '<rootDir>/__tests__/architecture/**/*.test.ts',
    '<rootDir>/__tests__/constitution/**/*.test.ts',
    // Revocation-safety sprint: these are enabled deliberately (see
    // docs/security/revocation/10-test-evidence.md) rather than via a blanket rewrite of
    // testMatch, because most other __tests__ directories in this repo currently fail to
    // type-check for reasons unrelated to revocation and are out of this sprint's scope.
    '<rootDir>/protocol/revocation/**/*.test.ts',
    '<rootDir>/protocol/consent/__tests__/**/*.test.ts',
    '<rootDir>/protocol/capability/__tests__/**/*.test.ts',
    '<rootDir>/protocol/enforcement/__tests__/**/*.test.ts',
    '<rootDir>/protocol/execution/__tests__/**/*.test.ts',
    '<rootDir>/protocol/capabilities/__tests__/**/*.test.ts',
    '<rootDir>/capability/__tests__/**/*.test.ts',
    '<rootDir>/consent/__tests__/**/*.test.ts',
    '<rootDir>/enforcement/__tests__/**/*.test.ts',
    '<rootDir>/vault/__tests__/**/*.test.ts',
    '<rootDir>/integration/hrkey/__tests__/aocVaultAdapter.test.ts',
    '<rootDir>/integration/hrkey/__tests__/capabilityEnforcement.test.ts',
    '<rootDir>/interpreter/__tests__/**/*.test.ts',
    '<rootDir>/aoc/capabilities/core/__tests__/**/*.test.ts',
    '<rootDir>/runtime/__tests__/controlPlaneRevocation.test.ts',
    '<rootDir>/runtime/api/__tests__/routesRevocation.test.ts',
    // Sovereign Asset Protocol Slice 0 (SAP-GAP-008 / SAP-GAP-010): activate
    // the existing asset/content foundation and the crypto engine's own
    // tests into the real build/test graph. These suites already passed
    // when run directly — they were simply excluded from testMatch and so
    // invisible to CI. See docs/architecture/asset-layer-canonicalization.md.
    '<rootDir>/crypto/__tests__/**/*.test.ts',
    '<rootDir>/content/__tests__/**/*.test.ts',
    '<rootDir>/pack/__tests__/**/*.test.ts',
    '<rootDir>/field/__tests__/**/*.test.ts',
    '<rootDir>/storage/__tests__/**/*.test.ts',
    '<rootDir>/resolver/__tests__/**/*.test.ts',
    '<rootDir>/sdl/__tests__/**/*.test.ts',
    // APV-03 (Asset Protocolization Vertical, asset profile framework): the
    // vertical owns its own test directory, and a new suite is invisible to CI
    // until its path is listed here. Adding it is a build-configuration change,
    // not a Protocol change — see the ADR's "Accepted costs".
    '<rootDir>/packages/asset-protocolization/tests/**/*.test.ts',
  ],
  moduleNameMapper: {
    '^@aoc/asset-protocolization$': '<rootDir>/packages/asset-protocolization/src',
    '^@aoc/protocol/contracts$': '<rootDir>/packages/protocol/src/contracts',
    '^@aoc/protocol/claims$': '<rootDir>/packages/protocol/src/claims',
    '^@aoc/protocol/adapters$': '<rootDir>/packages/protocol/src/adapters',
    '^@aoc/protocol/runtime-registry$': '<rootDir>/packages/protocol/src/runtime-registry',
    '^@aoc/protocol/canonical$': '<rootDir>/packages/protocol/src/canonical',
    '^@aoc/protocol/identity$': '<rootDir>/packages/protocol/src/identity',
    '^@aoc/protocol/manifest$': '<rootDir>/packages/protocol/src/manifest',
    '^@aoc/protocol/portability$': '<rootDir>/packages/protocol/src/portability',
    '^@aoc/protocol/interoperability$': '<rootDir>/packages/protocol/src/interoperability',
    '^@aoc/protocol/licensing$': '<rootDir>/packages/protocol/src/licensing',
    '^@aoc/protocol/governance-compatibility$': '<rootDir>/packages/protocol/src/governance-compatibility',
    '^@aoc/protocol/sovereignty-capabilities$': '<rootDir>/packages/protocol/src/sovereignty-capabilities',
    '^@aoc/enterprise/assurance/(.*)$': '<rootDir>/enterprise/src/assurance/$1',
    '^@aoc/enterprise/assurance$': '<rootDir>/enterprise/src/assurance',
    '^@aoc/enterprise$': '<rootDir>/enterprise/src',
    '^@aoc/capability-tokens$': '<rootDir>/packages/capability-tokens/src',
    '^@aoc/consent-engine$': '<rootDir>/packages/consent-engine/src',
    '^@aoc/scoped-access$': '<rootDir>/packages/scoped-access/src',
    '^@aoc/audit-sdk$': '<rootDir>/packages/audit-sdk/src',
    '^@aoc-runtime/audit-runtime$': '<rootDir>/packages/audit-runtime/src/index.ts',
    '^@aoc-runtime/authorization-runtime$': '<rootDir>/packages/authorization-runtime/src/index.ts',
    '^@aoc-runtime/capability-runtime$': '<rootDir>/packages/capability-runtime/src/index.ts',
    '^@aoc-runtime/consent-runtime$': '<rootDir>/packages/consent-runtime/src/index.ts',
    '^@aoc-runtime/portable-cognition$': '<rootDir>/packages/portable-cognition/src/index.ts',
    '^@aoc-runtime/trust-registry-runtime$': '<rootDir>/packages/trust-registry-runtime/src/index.ts',
    '^@aoc-runtime/governance-runtime$': '<rootDir>/packages/governance-runtime/src/index.ts',
    '^@aoc-runtime/provider-interfaces$': '<rootDir>/packages/provider-interfaces/src/index.ts',
    '^@aoc-runtime/shared-types$': '<rootDir>/packages/shared-types/src/index.ts',
    '^@aoc-runtime/crypto$': '<rootDir>/crypto/index.ts'
  }
};
