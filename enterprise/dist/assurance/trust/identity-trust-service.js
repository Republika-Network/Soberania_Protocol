"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TRUST_ISSUERS = exports.InMemoryTrustService = void 0;
exports.identityRegistrationPayload = identityRegistrationPayload;
const crypto_1 = require("@aoc-runtime/crypto");
const identity_verification_1 = require("../verification/identity-verification");
/** The bytes an issuer signs to register a credential or consent: the record without its signature. */
function identityRegistrationPayload(kind, input) {
    const { issuer_signature: _ignored, ...record } = input;
    return { kind: kind === 'credential' ? 'aoc.identity.credential' : 'aoc.identity.consent', record };
}
class InMemoryTrustService {
    constructor(initialIssuers = [], options = {}, verificationEngine = new identity_verification_1.IdentityVerificationEngine()) {
        this.verificationEngine = verificationEngine;
        this.issuers = new Map();
        this.credentials = new Map();
        this.consents = new Map();
        this.auditEvents = [];
        this.trustedIssuerKeys = options.trustedIssuerKeys;
        for (const issuer of initialIssuers)
            this.issuers.set(issuer.issuer_id, issuer);
    }
    getAuditEvents() {
        return [...this.auditEvents];
    }
    /**
     * Confirms that `input` was signed by the trusted key of the issuer it names,
     * and returns the signed record (read once). Throws otherwise.
     */
    authenticateIssuer(kind, input) {
        if (this.trustedIssuerKeys === undefined) {
            throw new Error('No trusted issuer keys are configured; identity registration is refused.');
        }
        const payload = identityRegistrationPayload(kind, input);
        const record = payload.record;
        const envelope = (0, crypto_1.snapshotGovernanceSignature)(input?.issuer_signature);
        if (!envelope ||
            typeof record.issuer_id !== 'string' ||
            envelope.signer.issuerId !== record.issuer_id ||
            !(0, crypto_1.verifyPayloadSignature)(payload, envelope, this.trustedIssuerKeys)) {
            throw new Error(`Identity ${kind} is not signed by issuer ${String(record.issuer_id)}.`);
        }
        return record;
    }
    registerCredential(signedInput) {
        const input = this.authenticateIssuer('credential', signedInput);
        const issuer = this.issuers.get(input.issuer_id);
        if (issuer === undefined || !issuer.active)
            throw new Error(`Issuer is invalid or inactive: ${input.issuer_id}`);
        if (!issuer.supported_kyc_levels.includes(input.kyc_level))
            throw new Error(`Issuer does not support KYC level: ${input.kyc_level}`);
        const record = {
            credential_ref: input.credential_ref,
            subject_hash: input.subject_hash,
            issuer_id: input.issuer_id,
            credential_hash: input.credential_hash,
            kyc_level: input.kyc_level,
            metadata_hash: input.metadata_hash,
            wallet_address: input.wallet_address,
            issued_at: input.issued_at,
            expires_at: input.expires_at,
        };
        this.credentials.set(record.credential_ref, record);
        this.auditEvents.push({
            event_type: 'CREDENTIAL_REGISTERED',
            at: input.issued_at,
            subject_hash: input.subject_hash,
            issuer_id: input.issuer_id,
            credential_ref: input.credential_ref,
        });
        if (input.wallet_address !== undefined) {
            this.auditEvents.push({
                event_type: 'WALLET_LINKED',
                at: input.issued_at,
                subject_hash: input.subject_hash,
                issuer_id: input.issuer_id,
                credential_ref: input.credential_ref,
            });
        }
        return record;
    }
    grantConsent(signedInput) {
        const input = this.authenticateIssuer('consent', signedInput);
        const issuer = this.issuers.get(input.issuer_id);
        if (issuer === undefined || !issuer.active)
            throw new Error(`Issuer is invalid or inactive: ${input.issuer_id}`);
        const consent = {
            consent_id: input.consent_id,
            subject_hash: input.subject_hash,
            consumer_id: input.consumer_id,
            issuer_id: input.issuer_id,
            granted_at: input.granted_at,
        };
        this.consents.set(input.consent_id, consent);
        this.auditEvents.push({
            event_type: 'CONSENT_GRANTED',
            at: input.granted_at,
            subject_hash: input.subject_hash,
            consumer_id: input.consumer_id,
            issuer_id: input.issuer_id,
        });
        return consent;
    }
    verifyIdentity(input) {
        const evaluation = this.verificationEngine.verify(input, {
            issuers: this.issuers,
            credentials: this.credentials.values(),
            consents: this.consents.values(),
        });
        this.pushVerificationAudit(input, evaluation.result, evaluation.credential);
        return evaluation.result;
    }
    enforcePayoutKyc(request, now = new Date()) {
        const verification = this.verifyIdentity({
            subject_hash: request.subject_hash,
            consumer_id: request.consumer_id,
            issuer_id: request.identity_issuer,
            now,
        });
        if (!verification.valid) {
            this.auditEvents.push({
                event_type: 'PAYOUT_BLOCKED',
                at: now.toISOString(),
                subject_hash: request.subject_hash,
                consumer_id: request.consumer_id,
                issuer_id: request.identity_issuer,
                credential_ref: request.identity_ref,
                reason_code: verification.reason_code,
            });
            return { allowed: false, reason_code: `PAYOUT_BLOCKED_${verification.reason_code}` };
        }
        this.auditEvents.push({
            event_type: 'PAYOUT_ALLOWED',
            at: now.toISOString(),
            subject_hash: request.subject_hash,
            consumer_id: request.consumer_id,
            issuer_id: verification.issuer,
            credential_ref: request.identity_ref,
            reason_code: verification.reason_code,
        });
        return { allowed: true, reason_code: 'PAYOUT_ALLOWED' };
    }
    pushVerificationAudit(input, result, credential) {
        this.auditEvents.push({
            event_type: 'VERIFICATION_PERFORMED',
            at: (input.now ?? new Date()).toISOString(),
            subject_hash: input.subject_hash,
            consumer_id: input.consumer_id,
            issuer_id: credential?.issuer_id,
            credential_ref: credential?.credential_ref,
            reason_code: result.reason_code,
        });
    }
}
exports.InMemoryTrustService = InMemoryTrustService;
exports.DEFAULT_TRUST_ISSUERS = [
    {
        issuer_id: 'kyc-global-v1',
        display_name: 'KYC Global',
        active: true,
        supported_kyc_levels: ['basic', 'enhanced', 'institutional'],
    },
];
