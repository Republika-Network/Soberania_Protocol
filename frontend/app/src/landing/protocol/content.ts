// Content model for the Soberanía Protocol landing page (W004).
//
// Thesis: Soberanía Protocol defines what a digital asset can be — identity,
// integrity, provenance, capabilities and sovereignty-related properties
// that compatible systems can interpret. Soberanía Enterprise operationalizes
// governance on top of it. This file holds the narrative data so the
// section components stay focused on layout.

export type ClaimStatus = 'Reference Model' | 'Future Direction';

export const STATUS_COPY: Record<ClaimStatus, string> = {
  'Reference Model': 'Defined as a canonical contract in @aoc/protocol today.',
  'Future Direction': 'Not yet defined as a canonical contract — a protocol direction.',
};

/** Mirrors SovereigntyCapabilityKey in @aoc/protocol/sovereignty-capabilities. */
export type SovereigntyCapabilityKey =
  | 'identity'
  | 'integrity'
  | 'provenance'
  | 'portability'
  | 'interoperability'
  | 'verifiability'
  | 'licensing_terms'
  | 'governance_compatibility';

export type CapabilityFamily = {
  id: string;
  /**
   * The canonical @aoc/protocol Sovereignty Capability this card renders.
   *
   * WHICH capabilities exist is owned by Protocol, not by this file — see
   * packages/protocol/src/sovereignty-capabilities. `frontend/app` is a
   * standalone npm project and does not resolve `@aoc/protocol`, so this list
   * cannot import the registry directly without a fragile build coupling.
   * Instead each entry names its Protocol key, and
   * __tests__/architecture/sovereignty-capability-frontend-parity.test.ts
   * fails if this list drifts from the Protocol registry in membership, order
   * or canonical name. Add, remove or rename a mineral in Protocol first.
   */
  protocolKey: SovereigntyCapabilityKey;
  name: string;
  status: ClaimStatus;
  summary: string;
};

// The Capability Dock's fused narrative (frontend/app/src/landing/protocol/
// CapabilityDockSection.tsx) — one eyebrow, one headline, one paragraph
// replacing what used to be two separate sections making overlapping
// points: CapabilityFamilies.tsx's "what a digital asset can declare" grid,
// and Sovereignty.tsx's "keeps its meaning wherever it goes" pitch.
export const CAPABILITY_DOCK_EYEBROW = '03 / Portable Meaning';
export const CAPABILITY_DOCK_HEADLINE = 'Keep the meaning. Change the system.';
export const CAPABILITY_DOCK_PARAGRAPH =
  "Systems change. Custodians change. Applications disappear. Capabilities preserve identity, integrity, origin, terms and meaning so a digital asset does not have to become a different thing every time its surrounding system changes.";

// The eight capability families a digital asset can express — the display
// model for the canonical Sovereignty Capabilities defined by
// packages/protocol/src/sovereignty-capabilities. Protocol owns which
// capabilities exist, their identities and their versions; this file owns
// only presentation (ids used by the dock's crystal geometry, maturity
// status, and landing copy). Status is not a claim that a runtime or
// creation SDK implements a capability end to end.
// Also the shared source for Soberanía Assurance's "Capability Domains" (see
// landing/enterprise/assurance/CapabilityDomains.tsx) — id/name/status/
// summary is a public shape read by that page too, so keep it stable.
export const CAPABILITY_FAMILIES: CapabilityFamily[] = [
  {
    id: 'identity',
    protocolKey: 'identity',
    name: 'Identity',
    status: 'Reference Model',
    summary:
      'A persistent, verifiable identity that names the asset independent of any single database, application or account.',
  },
  {
    id: 'integrity',
    protocolKey: 'integrity',
    name: 'Integrity',
    status: 'Reference Model',
    summary:
      "Proves the asset still matches its canonical definition — so it's still the original, not just whatever you were handed.",
  },
  {
    id: 'provenance',
    protocolKey: 'provenance',
    name: 'Provenance',
    status: 'Reference Model',
    summary:
      'Preserves where the asset came from, who registered it, and everything that has happened to it since.',
  },
  {
    id: 'portability',
    protocolKey: 'portability',
    name: 'Portability',
    status: 'Reference Model',
    summary:
      'Lets the asset move across systems, applications or custodians without losing its essential meaning.',
  },
  {
    id: 'interoperability',
    protocolKey: 'interoperability',
    name: 'Interoperability',
    status: 'Reference Model',
    summary:
      'Lets different systems understand and work with the asset consistently, without a one-off integration for each pair.',
  },
  {
    id: 'verifiability',
    protocolKey: 'verifiability',
    name: 'Verifiability',
    status: 'Reference Model',
    summary:
      "Lets an independent party validate the asset's claims and properties directly, instead of trusting whoever presents them.",
  },
  {
    id: 'licensing',
    protocolKey: 'licensing_terms',
    name: 'Licensing & Terms',
    status: 'Future Direction',
    summary:
      'Would carry the terms that define how the asset may be accessed, used or shared — a protocol direction, not yet a canonical contract.',
  },
  {
    id: 'governance-compatibility',
    protocolKey: 'governance_compatibility',
    name: 'Governance Compatibility',
    status: 'Reference Model',
    summary:
      "Lets governance systems interpret the asset's capabilities and apply rules around it — consent, access, revocation.",
  },
];

// The Asset Composition section's narrative (frontend/app/src/landing/
// protocol/AssetComposition.tsx) — replaces what used to be a six-step
// creation-flow timeline with a single idea: a digital asset gains value as
// capabilities are composed into it, not by moving through steps. Copy is
// deliberately written for a business audience, not an engineering one — no
// "canonical", "SDK", "protocol contract" or "declared digest".
export const COMPOSITION_EYEBROW = 'Digital Asset Composition';
export const COMPOSITION_HEADLINE = 'Meaning is added one capability at a time.';
export const COMPOSITION_PARAGRAPH =
  "A file becomes a digital asset as capabilities are incorporated into it. Each one adds something the file didn't have on its own — an identity that holds, proof it hasn't changed, a record of where it came from, the ability to move between systems without losing what it is. It doesn't become an asset because another step happened. It becomes one because another piece of meaning was added.";
export const COMPOSITION_CTA_LABEL = 'See what a digital asset can express';
export const COMPOSITION_CTA_HREF = '#capabilities';

export type CompositionCapabilityId = 'identity' | 'integrity' | 'origin' | 'capabilities' | 'portability' | 'compatibility';

export type CompositionLayer = {
  id: CompositionCapabilityId;
  name: string;
  sentence: string;
};

export const COMPOSITION_LAYERS: CompositionLayer[] = [
  { id: 'identity', name: 'Identity', sentence: 'It becomes identifiable — recognized as itself, no matter where it is stored.' },
  { id: 'integrity', name: 'Integrity', sentence: "It becomes trustworthy — provably unchanged from the moment it was created." },
  { id: 'origin', name: 'Origin', sentence: 'It becomes traceable — carrying where it came from and what has happened to it since.' },
  { id: 'capabilities', name: 'Capabilities', sentence: 'It becomes expressive — able to state what it allows and what it means.' },
  { id: 'portability', name: 'Portability', sentence: 'It becomes portable — able to move between systems without losing itself.' },
  { id: 'compatibility', name: 'Compatibility', sentence: 'It becomes understandable — readable by every system built to recognize it.' },
];

export type BuilderAudience = {
  name: string;
  summary: string;
};

export const BUILDER_AUDIENCES: BuilderAudience[] = [
  { name: 'Application developers', summary: 'building tools that create, read or move digital assets.' },
  { name: 'Storage platforms', summary: 'that want asset identity to survive a migration off their platform.' },
  { name: 'Digital-asset tooling', summary: 'for creation, verification or cataloging workflows.' },
  { name: 'Creator platforms', summary: 'issuing photos, media or other work with provenance attached.' },
  { name: 'Document systems', summary: 'that need portable identity and integrity across organizational boundaries.' },
  { name: 'AI and data platforms', summary: 'that need datasets and model files to carry verifiable origin.' },
  { name: 'Infrastructure providers', summary: 'implementing adapters so their systems interoperate with compatible assets.' },
];
