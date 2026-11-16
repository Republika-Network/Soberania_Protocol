// Content model for the Soberanía Enterprise homepage.
//
// The homepage has one job: explain why Soberanía Enterprise exists. Soberanía Protocol
// defines governed capabilities. Soberanía Enterprise is where an organization
// composes the subset of those capabilities its own architecture needs.
// Governance is what that composition produces, not where it starts.

export type Maturity = 'Stable' | 'Beta' | 'Preview';

// The conceptual flow the whole homepage is structured around. It recurs as a
// small rail across sections so the narrative stays visible while scrolling.
export const FLOW = ['Business Needs', 'Protocol Capabilities', 'Business Architecture', 'Governance'] as const;
export type FlowStage = (typeof FLOW)[number];

export type NavItem = {
  label: string;
  href: string;
};

// A top-level nav entry is either a direct link, or a group (Solutions,
// Services) that discloses child links. Groups model the approved
// Enterprise IA: Enterprise is the commercial umbrella, Solutions and
// Services are the categories of what it sells, and each currently holds
// exactly one live offering (Governed Access, Assurance respectively) with
// room to grow.
export type NavGroup = {
  label: string;
  children: NavItem[];
};

export type NavEntry = NavItem | NavGroup;

export const isNavGroup = (entry: NavEntry): entry is NavGroup => 'children' in entry;

export const ENTERPRISE_NAV_ITEMS: NavEntry[] = [
  { label: 'Overview', href: '/?view=enterprise#overview' },
  { label: 'Solutions', children: [{ label: 'Governed Access', href: '/?view=governed-access' }] },
  { label: 'Services', children: [{ label: 'Assurance', href: '/?view=assurance' }] },
  { label: 'Architecture', href: '/?view=enterprise#architecture' },
  { label: 'Developers', href: '/docs' },
];

// The capability catalog — a flat set of governed powers an architecture can be
// composed from. An architecture pattern only surfaces the subset relevant to it.
export type CapabilityId =
  | 'identity'
  | 'authority'
  | 'accountability'
  | 'delegation'
  | 'evidence'
  | 'audit'
  | 'execution'
  | 'consent'
  | 'ownership'
  | 'portability'
  | 'passport'
  | 'decisions'
  | 'policy-enforcement'
  | 'approvals'
  | 'authority-chains'
  | 'agent-identity'
  | 'payments'
  | 'economic-governance'
  | 'custody'
  | 'provenance';

export const CAPABILITY_CATALOG: Record<CapabilityId, { name: string; summary: string }> = {
  identity: { name: 'Identity', summary: 'Establish who, or what, is acting inside the architecture.' },
  authority: { name: 'Authority', summary: 'Define and constrain who can act, delegate, and on whose behalf.' },
  accountability: { name: 'Accountability', summary: 'Attribute outcomes to identities, policies, and decisions.' },
  delegation: { name: 'Delegation', summary: 'Scoped, auditable transfer of authority between principals.' },
  evidence: { name: 'Evidence', summary: 'Verifiable, replayable proof for every governed action.' },
  audit: { name: 'Audit', summary: 'Immutable operational history of the architecture.' },
  execution: { name: 'Execution', summary: 'Bounded, attested runtime behavior for processes and agents.' },
  consent: { name: 'Consent', summary: 'Explicit, revocable authorization over how data is used.' },
  ownership: { name: 'Ownership', summary: 'Clear custodial rights over a data entity.' },
  portability: { name: 'Portability', summary: 'The right and mechanism to move data between systems.' },
  passport: { name: 'Passport', summary: 'A portable, verifiable identity credential for agents.' },
  decisions: { name: 'Decisions', summary: 'Structured, attributable decision points within a process.' },
  'policy-enforcement': { name: 'Policy Enforcement', summary: 'Real-time enforcement of codified rules.' },
  approvals: { name: 'Approvals', summary: 'Human or policy checkpoints required before execution.' },
  'authority-chains': { name: 'Authority Chains', summary: 'Traceable lineage of delegated authority.' },
  'agent-identity': { name: 'Agent Identity', summary: 'Identity primitives scoped to autonomous agents.' },
  payments: { name: 'Payments', summary: 'Governed movement of value between principals.' },
  'economic-governance': { name: 'Economic Governance', summary: 'Rules governing consumption, settlement, and exchange.' },
  custody: { name: 'Custody', summary: 'Safekeeping and custodial control of an asset.' },
  provenance: { name: 'Provenance', summary: 'Verifiable origin and history of an asset or record.' },
};

export type ArchitectureShape = 'square' | 'circle' | 'diamond' | 'hex' | 'triangle' | 'pentagon';

export type ArchitectureCapabilitySet = {
  enabled: CapabilityId[];
  available: CapabilityId[];
  dependencies: string[];
};

export type ArchitecturePattern = {
  id: string;
  name: string;
  shape: ArchitectureShape;
  tagline: string;
  summary: string;
  maturity: Maturity;
  capabilitySet: ArchitectureCapabilitySet;
};

// The six centers of gravity a business architecture can be built around. Picking
// one is the first decision Soberanía Enterprise asks of an organization — it determines
// which capabilities and, later, which governance concepts apply.
export const ARCHITECTURE_PATTERNS: ArchitecturePattern[] = [
  {
    id: 'organization',
    name: 'Organization',
    shape: 'square',
    tagline: 'The enterprise itself is the sovereign entity.',
    summary: 'Business units, roles, and delegated authority compose the architecture. The organization is what everything else operates on behalf of.',
    maturity: 'Stable',
    capabilitySet: {
      enabled: ['identity', 'authority', 'accountability', 'delegation', 'approvals', 'audit'],
      available: ['economic-governance', 'agent-identity'],
      dependencies: ['Authority is scoped by Identity', 'Approvals attach to Authority Chains'],
    },
  },
  {
    id: 'data',
    name: 'Data',
    shape: 'circle',
    tagline: 'Data is the sovereign entity — not the application that touches it.',
    summary: 'Data assets carry their own custody, lineage, and consent boundaries independent of any single application that reads or writes them.',
    maturity: 'Stable',
    capabilitySet: {
      enabled: ['identity', 'consent', 'ownership', 'portability', 'evidence', 'delegation'],
      available: ['authority', 'audit'],
      dependencies: ['Consent is scoped by Identity', 'Portability requires Evidence of custody'],
    },
  },
  {
    id: 'governed-framework',
    name: 'Governed Framework',
    shape: 'diamond',
    tagline: 'A process operating inside a regulated framework is the sovereign entity.',
    summary: 'Any system that must operate inside a regulated or accountable framework — decisions, evidence, and enforcement compose the architecture, independent of what the process is actually about.',
    maturity: 'Beta',
    capabilitySet: {
      enabled: ['execution', 'decisions', 'accountability', 'evidence', 'policy-enforcement', 'audit', 'approvals', 'authority-chains'],
      available: ['economic-governance', 'agent-identity'],
      dependencies: ['Approvals attach to Authority Chains', 'Policy Enforcement acts on Decisions'],
    },
  },
  {
    id: 'agent',
    name: 'Agent',
    shape: 'hex',
    tagline: 'An autonomous or AI agent is the sovereign, delegated actor.',
    summary: 'Agents act as delegated sovereign actors operating inside explicitly bounded authority, carrying their own portable identity and accountability trail.',
    maturity: 'Beta',
    capabilitySet: {
      enabled: ['identity', 'authority', 'accountability', 'passport', 'delegation', 'audit'],
      available: ['execution', 'evidence'],
      dependencies: ['Passport extends Identity', 'Delegation is bounded by Authority'],
    },
  },
  {
    id: 'asset',
    name: 'Asset',
    shape: 'triangle',
    tagline: 'A digital or physical asset is the sovereign entity.',
    summary: 'Assets carry sovereign custody, provenance, and transfer governance across their lifecycle, independent of whichever system currently holds them.',
    maturity: 'Preview',
    capabilitySet: {
      enabled: ['identity', 'custody', 'provenance', 'evidence', 'delegation'],
      available: ['economic-governance', 'payments'],
      dependencies: ['Custody requires Identity', 'Provenance is proven by Evidence'],
    },
  },
  {
    id: 'transaction',
    name: 'Transaction',
    shape: 'pentagon',
    tagline: 'The economic exchange itself is the sovereign, auditable event.',
    summary: 'Exchanges of value are modeled as sovereign, auditable events with explicit authority, bounded execution, and settlement evidence.',
    maturity: 'Preview',
    capabilitySet: {
      enabled: ['identity', 'authority', 'execution', 'evidence', 'economic-governance'],
      available: ['payments', 'audit'],
      dependencies: ['Execution is bounded by Authority', 'Economic Governance requires Evidence'],
    },
  },
];

// The homepage's only entry point into capability detail — plain navigation,
// not explanation. Each of these owns its own dedicated page.
export type ExploreCapability = {
  slug: string;
  name: string;
  summary: string;
};

export const EXPLORE_CAPABILITIES: ExploreCapability[] = [
  { slug: 'identity', name: 'Identity', summary: 'Establish who, or what, is acting inside the architecture.' },
  { slug: 'authority', name: 'Authority', summary: 'Define and constrain who can act, delegate, and on whose behalf.' },
  { slug: 'delegation', name: 'Delegation', summary: 'Scoped, auditable transfer of authority between principals.' },
  { slug: 'evidence', name: 'Evidence', summary: 'Verifiable, replayable proof for every governed action.' },
  { slug: 'policy', name: 'Policy', summary: 'Codified rules that constrain how a capability may be exercised.' },
  { slug: 'federation', name: 'Federation', summary: 'Trust and interoperability across independently governed architectures.' },
  { slug: 'audit', name: 'Audit', summary: 'Immutable operational history of the architecture.' },
  { slug: 'economy', name: 'Economy', summary: 'Governed consumption, settlement, and exchange of value.' },
];
