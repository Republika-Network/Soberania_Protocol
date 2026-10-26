import type { CapabilityTokenV1 } from '../../../capability';
import type { ConsentObjectV1 } from '../../../consent';
import { assertConsentObjectAuthenticated } from '../../../consent/signing';

export function verifyCapabilityConsentBinding(
  token: CapabilityTokenV1,
  consent: ConsentObjectV1
): void {
  assertConsentObjectAuthenticated(consent);
  if (token.consent_ref !== consent.consent_hash) {
    throw new Error(
      'Capability consent_ref does not match parent consent consent_hash.'
    );
  }
  if (consent.action !== 'grant') {
    throw new Error('Parent consent action must be "grant".');
  }
  if (token.subject !== consent.subject) {
    throw new Error(
      'Capability subject does not match parent consent subject.'
    );
  }
  if (token.grantee !== consent.grantee) {
    throw new Error(
      'Capability grantee does not match parent consent grantee.'
    );
  }
  if (token.marketMakerId !== consent.marketMakerId) {
    throw new Error(
      'Capability marketMakerId does not match parent consent marketMakerId.'
    );
  }

  const consentScope = new Set(
    consent.scope.map((entry) => `${entry.type}:${entry.ref}`)
  );
  for (const entry of token.scope) {
    if (!consentScope.has(`${entry.type}:${entry.ref}`)) {
      throw new Error(
        'Scope escalation: token scope entry not found in parent consent scope.'
      );
    }
  }

  const consentPermissions = new Set(consent.permissions);
  for (const permission of token.permissions) {
    if (!consentPermissions.has(permission)) {
      throw new Error(
        'Permission escalation: token permission not found in parent consent permissions.'
      );
    }
  }

}
