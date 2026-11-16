// Content model for the Soberanía Protocol landing page (W004).
//
// Thesis: Soberanía Protocol defines what a digital asset can be — identity,
// integrity, provenance, capabilities and sovereignty-related properties
// that compatible systems can interpret. Soberanía Enterprise operationalizes
// governance on top of it. This file holds the narrative data so the
// section components stay focused on layout.

export type ClaimStatus = 'Reference Model' | 'Future Direction';

export const STATUS_COPY: Record<ClaimStatus, string> = {
  'Reference Model': 'Defined as a canonical contract in the protocol package today.',
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
    status: 'Reference Model',
    summary:
      'Carries machine-readable declarations of how the asset may be accessed, used or shared. Declared terms are not an access grant, runtime enforcement, legal validity or guaranteed compliance, and participating applications do not enforce them automatically.',
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

// "04 / For builders" — how a builder adopts the protocol, and what is
// actually available today. Every statement here must stay true of the public
// repository's main branch; when a status changes, change it here first.
export type IntegrationPoint = { title: string; body: string };

export const INTEGRATION_POINTS: IntegrationPoint[] = [
  {
    title: 'Adopt one capability at a time',
    body: 'Each entry point (identity, canonical JSON, manifests, claims, portability and the rest) is a separate, versioned contract. Use the ones you need and ignore the others.',
  },
  {
    title: 'The SDK is optional',
    body: 'A thin composition layer over the same capabilities is being prepared. You never need it to use the protocol contracts directly.',
  },
  {
    title: 'No chain required',
    body: 'Records are canonical JSON with Ed25519 proofs and SHA-256 content identities. They work off-chain and assume no ledger. Adapters are provider-neutral interfaces.',
  },
  {
    title: 'No Frontera dependency',
    body: 'The protocol package has no runtime dependencies and needs no hosted service. Frontera Systems is one optional product built on top of it.',
  },
];

export type AvailabilityStatus =
  | 'Available from source'
  | 'Not yet available'
  | 'Proposed'
  | 'Internal candidate'
  | 'Prepared, not published'
  | 'Not claimed';

export type AvailabilityRow = { item: string; status: AvailabilityStatus; detail: string };

export const AVAILABILITY: AvailabilityRow[] = [
  {
    item: 'Free protocol adoption',
    status: 'Available from source',
    detail: 'Apache-2.0. No fee, no account and no Frontera required. Contracts are at release candidate 0.2.0-rc.3; build them from the repository.',
  },
  {
    item: 'Eight sovereignty capabilities',
    status: 'Available from source',
    detail: 'All eight are canonical, versioned contracts (1.0.0). Declaring a capability is not the same as enforcing it.',
  },
  {
    item: 'Technical conformity',
    status: 'Not yet available',
    detail: 'There is no published conformance suite or conformity mark yet. The repository\'s consumer fixtures and integration contract let you check your own integration.',
  },
  {
    item: 'Soberanía Assured',
    status: 'Proposed',
    detail: 'A future commercial program for continuous assurance, powered by Frontera. It is not offered today.',
  },
  {
    item: 'Optional SDK',
    status: 'Internal candidate',
    detail: 'Not public yet and pending independent security review before release. You never need it to use the protocol.',
  },
  {
    item: 'npm packages',
    status: 'Prepared, not published',
    detail: '@soberania-protocol/protocol and @soberania-protocol/sdk. There is no install command until they are published.',
  },
  {
    item: 'Independent certification',
    status: 'Not claimed',
    detail: 'No component is presented as independently audited, certified or production-ready.',
  },
];

// "03 / From protocol to systems" — the proposed commercial program. It must
// stay labelled as proposed until it actually operates: no enrolment,
// monitoring or certification is running. It is separate from the AI risk
// assessment sold today under /assurance/intelligence-risk.
export const ASSURED_PROPOSAL = {
  status: 'Proposed · not yet available',
  name: 'Soberanía Assured, powered by Frontera',
  body: 'A planned program for platforms that choose to take part: continuous verification of their conformance to approved Soberanía controls, with enforcement by Frontera. It is not operating today. No platform is enrolled, monitored or certified, and it is separate from the AI risk assessment offered today.',
  limits:
    'It could only ever cover systems that cooperate. It cannot control documents inside applications that do not take part, and it cannot recall information already disclosed in plaintext. Soberanía Protocol itself never requires it.',
};
