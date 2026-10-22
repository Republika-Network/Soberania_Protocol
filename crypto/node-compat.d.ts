declare module "node:crypto" {
  export function createCipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array): any;
  export function createDecipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array): any;
  export function createHash(algorithm: string): { update(data: string): { digest(encoding: string): string } };
  export interface KeyObject {
    readonly type: string;
    readonly asymmetricKeyType?: string;
    export(options: { type: 'spki'; format: 'pem' }): string;
  }
  export function createPublicKey(key: string): KeyObject;
  export function generateKeyPairSync(type: string): { publicKey: any; privateKey: any };
  export function randomBytes(size: number): Uint8Array;
  export function sign(algorithm: unknown, data: Uint8Array, key: string): Uint8Array & { toString(encoding?: string): string };
  export function verify(algorithm: unknown, data: Uint8Array, key: string, signature: Uint8Array): boolean;
}
declare const Buffer: {
  from(data: string | Uint8Array, encoding?: string): Uint8Array & { toString(encoding?: string): string };
  concat(chunks: ReadonlyArray<Uint8Array>): Uint8Array & { toString(encoding?: string): string };
};
