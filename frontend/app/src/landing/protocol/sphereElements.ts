// The eight parts of the sovereign sphere, shared by the hero's mirror
// annotations and the 01 / Sovereign Sphere atlas row.
export type SphereElementId =
  | 'identity'
  | 'property'
  | 'assets'
  | 'rights'
  | 'consent'
  | 'claims'
  | 'provenance'
  | 'authority';

export type SphereElement = { id: SphereElementId; title: string; copy: string };

export const SPHERE_ELEMENTS: SphereElement[] = [
  { id: 'identity', title: 'Identity', copy: 'Who the subject is.' },
  { id: 'property', title: 'Property', copy: 'What remains yours.' },
  { id: 'assets', title: 'Assets', copy: 'Value that travels.' },
  { id: 'rights', title: 'Rights', copy: 'How it may be used.' },
  { id: 'consent', title: 'Consent', copy: 'Revocable permission.' },
  { id: 'claims', title: 'Claims', copy: 'Assertions about you.' },
  { id: 'provenance', title: 'Provenance', copy: 'Where it came from.' },
  { id: 'authority', title: 'Authority', copy: 'Who may decide.' },
];
