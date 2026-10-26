export { buildConsentObject, validateConsentObject } from './consentObject';
export { buildConsentId } from './consentId';
export { canonicalizeConsentPayload } from './canonical';
export type { ConsentPayload } from './canonical';
export { computeConsentHash } from './hash';
export {
  assertConsentObjectAuthenticated,
  signConsentObject,
  verifyConsentObjectProof
} from './signing';
export {
  createDidKeySigner,
  createSubjectConsentProof,
  didKeyFromEd25519Key,
  resolveDidKeyEd25519,
  SubjectConsentProofError,
  verifySubjectConsentProof,
  SUBJECT_CONSENT_PROOF_ALG,
  SUBJECT_CONSENT_PROOF_TYPE,
  SUBJECT_CONSENT_PROOF_VERSION
} from './proof';
export type {
  ConsentSubjectSigner,
  SubjectConsentProofFailureCode,
  SubjectConsentProofResult,
  SubjectConsentProofV1,
  SubjectConsentStatement
} from './proof';
export type {
  BuildConsentOptions,
  ConsentObjectV1,
  ConsentPricing,
  ScopeEntry
} from './types';
