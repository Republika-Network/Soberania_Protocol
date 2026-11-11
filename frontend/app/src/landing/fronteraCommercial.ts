// Where Soberanía hands a business visitor to Frontera Systems (SOBE-MKT-00).
//
// Soberanía Protocol is the open foundation; Frontera Systems is the
// commercial provider that replaced the retired "Soberanía Enterprise" brand
// (see ./brand.ts). Every commercial call to action on this site therefore
// leaves for frontera-systems.com, names Frontera Systems in its label, and
// carries referral UTMs so Frontera can see which enquiries came from here.
//
// These replace the `hello@aocprotocol.xyz` mailto CTAs: that domain no
// longer resolves, so every "Request Technical Assessment" / "Live Demo"
// enquiry sent to it was lost.
//
// Kept in its own module (not brand.ts) so this change does not overlap the
// in-flight homepage/SEO refactor that is editing brand.ts.

import { FRONTERA_SYSTEMS_NAME, FRONTERA_SYSTEMS_URL } from './brand';

export { FRONTERA_SYSTEMS_NAME };

const REFERRAL = 'utm_source=soberaniaprotocol.org&utm_medium=referral';

function fronteraUrl(path: string, content: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${FRONTERA_SYSTEMS_URL}${path}${separator}${REFERRAL}&utm_content=${encodeURIComponent(content)}`;
}

/** Frontera's live, paid Technical Assessment page (it also offers the free fit call). */
export const fronteraAssessmentHref = (content: string) => fronteraUrl('/?view=technical-assessment', content);

/** Frontera's public, interactive governed-payment demo (a sandbox rehearsal). */
export const fronteraDemoHref = (content: string) => fronteraUrl('/demo/governed-payment', content);

/** Frontera's fit-call page (`?view=fit-call`): the direct booking route,
 * which leads with Frontera's Calendly scheduler. Every "Book a fit call"
 * action on this site uses it, so the visitor lands one step from booking. */
export const fronteraFitCallHref = (content: string) => fronteraUrl('/?view=fit-call', content);

/** Frontera's homepage, for "Visit Frontera Systems" (not a booking action). */
export const fronteraHomeHref = (content: string) => fronteraUrl('/', content);

/** Frontera's pages for the two offers this site used to present as Soberanía Enterprise. */
export const fronteraGovernedAccessHref = (content: string) => fronteraUrl('/?view=governed-access', content);
export const fronteraAssuranceHref = (content: string) => fronteraUrl('/?view=assurance', content);
