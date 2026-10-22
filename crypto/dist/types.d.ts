export type EncryptedObject = {
    version: 1;
    algorithm: 'AES-256-GCM';
    nonce: string;
    ciphertext: string;
    auth_tag: string;
};
export interface RuntimeAuthorityIdentity {
    authorityId: string;
    issuerId: string;
    runtimeId: string;
    algorithm: 'ed25519';
    publicKey: string;
    keyId: string;
}
/**
 * A signing key a verifier trusts because it was configured independently of
 * any signed object (a trust registry, a pinned key set) — never because a
 * signature envelope carried it.
 */
export interface TrustedSigningKey {
    keyId: string;
    publicKey: string;
    authorityId: string;
    issuerId: string;
    runtimeId: string;
}
export interface TrustedKeyResolver {
    /**
     * The trusted key registered under `keyId` and usable now, by the resolver's
     * own clock, or `undefined` when there is none. The caller never supplies
     * the time.
     */
    resolveTrustedKey(keyId: string): TrustedSigningKey | undefined;
}
export interface GovernanceSignature {
    algorithm: 'ed25519';
    keyId: string;
    signer: RuntimeAuthorityIdentity;
    signature: string;
    signedAt: string;
    payloadHash: string;
    provenance: {
        runtimeSource: string;
        timestamp: string;
        chainPosition?: number;
        previousHash?: string;
    };
}
export interface SignedAuthorizationDecision<TDecision = Record<string, unknown>> {
    decision: TDecision;
    decisionHash: string;
    evaluationHash: string;
    signature: GovernanceSignature;
}
export interface SignedAuditEvent<TEvent = Record<string, unknown>> {
    event: TEvent;
    eventHash: string;
    previousEventHash?: string;
    chainPosition: number;
    chainId: string;
    signature: GovernanceSignature;
}
export interface SignedConsentGrant<TGrant = Record<string, unknown>> {
    grant: TGrant;
    grantHash: string;
    issuerSignature: GovernanceSignature;
    delegatedSignature?: GovernanceSignature;
    revocationSignature?: GovernanceSignature;
}
export interface PortableCognitionIntegrity {
    packageHash: string;
    governanceSnapshotHash: string;
    auditContinuityHash: string;
    topologyHash: string;
    provenanceHash: string;
}
//# sourceMappingURL=types.d.ts.map