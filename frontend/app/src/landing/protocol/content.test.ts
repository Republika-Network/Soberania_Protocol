import { describe, expect, it } from 'vitest';
import { CAPABILITY_FAMILIES, STATUS_COPY } from './content';

// SOB-PUBLIC-ALIGN-01G: Licensing & Terms is a Reference Model because the canonical
// `licensing_terms` capability exists in packages/protocol (the root parity test binds
// every card to exactly one canonical capability). The card describes declarations only.
describe('Licensing & Terms capability card', () => {
  const licensing = CAPABILITY_FAMILIES.find((family) => family.id === 'licensing')!;

  it('is bound to the canonical licensing_terms capability and marked Reference Model', () => {
    expect(licensing.protocolKey).toBe('licensing_terms');
    expect(licensing.status).toBe('Reference Model');
    expect(STATUS_COPY[licensing.status]).toBe('Defined as a canonical contract in the protocol package today.');
  });

  it('separates machine-readable declared terms from enforcement, legal validity and compliance', () => {
    expect(licensing.summary).toContain('machine-readable declarations');
    for (const disclaimer of ['access grant', 'runtime enforcement', 'legal validity', 'guaranteed compliance']) {
      expect(licensing.summary).toContain(disclaimer);
    }
    expect(licensing.summary).toContain('participating applications do not enforce them automatically');
  });

  it('never claims that terms are enforced, legally valid or compliant by declaration', () => {
    expect(licensing.summary).not.toMatch(/\b(enforces|enforced|guarantees|ensures)\b/i);
    expect(licensing.summary).not.toMatch(/\bautomatically enforce/i);
  });
});
