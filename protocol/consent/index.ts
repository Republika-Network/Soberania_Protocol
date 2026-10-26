export { parseConsent } from './consent-object';
export { normalizeConsent } from './consent-normalizer';
export { validateConsent } from './consent-validator';
export { evaluateConsentState, isConsentActive, isConsentRevoked } from './consent-state';
export { doesConsentAllowScope } from './consent-machine';
export { evaluateConsent } from './evaluate';
export type { ConsentDecisionOptions } from './evaluate';
export { isValidConsentRecord, isValidConsentRequest } from './validate';
export { signConsentRecord, verifyConsentRecordProof } from './consent-record-proof';
export { CONSENT_DECISION_REASON_CODES } from './types';

export { ConsentParseError, ConsentValidationError } from './consent-errors';

export type {
  ProtocolConsent,
  ConsentState,
  ConsentValidationResult,
  ConsentStateResult,
  ConsentEvaluationOptions,
  ConsentScopeRequest,
} from './consent-types';

export type {
  ConsentRecord,
  ConsentRequest,
  ConsentDecision,
  ConsentDecisionReasonCode,
} from './types';

export * from './capability-index';
