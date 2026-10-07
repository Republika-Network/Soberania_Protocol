import type { ReactNode } from 'react';
import type { SphereElementId } from './sphereElements';

// Line specimens for the sovereign sphere, drawn on a 24-unit grid so they
// stay crisp at any size.
const PATHS: Record<SphereElementId, ReactNode> = {
  identity: (
    <>
      <path d="M7.5 5.2A8 8 0 0 1 20 12v1.5" />
      <path d="M4.6 8.4A8 8 0 0 0 4 12v3" />
      <path d="M7.3 18.6A11 11 0 0 0 8 13v-1a4 4 0 0 1 8 0v1.4" />
      <path d="M12 12v1.5a14 14 0 0 1-1.6 6.5" />
      <path d="M16 16.5a17 17 0 0 1-1.2 4" />
      <path d="M19.6 16.8a20 20 0 0 1-.6 2.2" />
    </>
  ),
  property: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 11h6M9 14h6M9 17h4" />
    </>
  ),
  assets: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.6" />
      <path d="M5 6v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" />
      <path d="M5 10v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-4" />
      <path d="M5 14v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-4" />
    </>
  ),
  rights: (
    <>
      <path d="M3.5 9 12 4l8.5 5z" />
      <path d="M5 9v9M9 9v9M15 9v9M19 9v9" />
      <path d="M3 18.5h18M2.5 21h19" />
    </>
  ),
  consent: (
    <>
      <circle cx="7" cy="6" r="2" />
      <circle cx="17" cy="6" r="2" />
      <circle cx="12" cy="4" r="1.6" />
      <path d="M7 8v3l5 3 5-3V8M12 5.6V14" />
      <path d="M5 21v-2.5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3V21" />
    </>
  ),
  claims: (
    <>
      <circle cx="12" cy="12" r="2.4" />
      <circle cx="5" cy="5" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="m6.5 6.5 3.8 3.8M17.5 6.5l-3.8 3.8M6.5 17.5l3.8-3.8M17.5 17.5l-3.8-3.8" />
    </>
  ),
  provenance: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="m3 17 5.5-6 4 4.5 2.5-2.5L21 18" />
      <circle cx="16" cy="8.5" r="1.5" />
    </>
  ),
  authority: (
    <>
      <path d="M12 2.8 19.5 6v5.4c0 4.6-3.2 8.3-7.5 9.8-4.3-1.5-7.5-5.2-7.5-9.8V6z" />
      <path d="m12 8 1.3 2.7 3 .4-2.2 2.1.5 3L12 14.8l-2.6 1.4.5-3-2.2-2.1 3-.4z" />
    </>
  ),
};

export function SphereIcon({ id, className }: { id: SphereElementId; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[id]}
    </svg>
  );
}
