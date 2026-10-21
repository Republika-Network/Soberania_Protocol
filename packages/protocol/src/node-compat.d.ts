/**
 * Minimal ambient declarations for the subset of Node's built-in `node:crypto`
 * module used by `@aoc/protocol`'s sovereign asset signing primitives
 * (`src/manifest/proof.ts`, `src/identity/content-identity.ts`,
 * `src/identity/sovereign-asset-id.ts`).
 *
 * Why this exists: this repository's `tsconfig.base.json` uses classic
 * (`Node10`) module resolution, which does not understand the `node:`
 * specifier scheme, and a bare `'crypto'` specifier is ambiguous here
 * because a real workspace package lives at the repo-root `crypto/`
 * directory (`@aoc-runtime/crypto`) that would otherwise shadow it via
 * `baseUrl` resolution. `crypto/node-compat.d.ts` solves this exact
 * problem for that package already; this is the same fix scoped to
 * `@aoc/protocol`. It is excluded from `tsconfig.test.json` (see that
 * file) so it never conflicts with the real `@types/node` declarations
 * used during Jest's full-repo type-checked test run.
 */
declare module 'node:crypto' {
  export function createHash(algorithm: string): {
    update(data: string | Uint8Array): { digest(encoding: string): string };
  };
  export function randomUUID(): string;
  export function generateKeyPairSync(type: string): { publicKey: any; privateKey: any };
  export function sign(algorithm: unknown, data: Uint8Array, key: string): Uint8Array & { toString(encoding?: string): string };
  export function verify(algorithm: unknown, data: Uint8Array, key: string | KeyObject, signature: Uint8Array): boolean;
  export interface KeyObject {
    readonly type: string;
    readonly asymmetricKeyType?: string;
    export(options: { type: 'spki'; format: 'pem' }): string;
    export(options: { type: 'spki'; format: 'der' }): Uint8Array & { equals(other: Uint8Array): boolean };
  }
  export function createPublicKey(key: string | { key: Record<string, unknown>; format: 'jwk' }): KeyObject;
}
declare const Buffer: {
  from(data: string, encoding?: string): Uint8Array & { toString(encoding?: string): string };
};
