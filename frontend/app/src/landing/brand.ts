// Canonical public brand pointers, shared by every landing surface.
//
// Lives here rather than under landing/protocol/ because landing/components/
// (the shared footer) needs them too, and a shared component must not depend
// on one surface's directory.
//
// Brand architecture: Republika Network (ecosystem) -> Soberanía Protocol
// (open protocol layer) -> Frontera Systems (commercial systems layer, which
// operationalizes Protocol capabilities) -> centers of gravity. Frontera
// Systems replaced the retired "Soberanía Enterprise" product brand, and it
// lives on its own site rather than behind the in-app `?view=enterprise`
// route, so every visible reference to it points out of this origin.
//
// Internal identifiers (EnterpriseId, enterpriseNodes, `layer="enterprise"`,
// the landing/enterprise directory, …) intentionally keep the old term as
// implementation terminology; only the public brand moved.
// The canonical public origin of the Soberanía Protocol site. Apex, not www:
// no deployment config in this repository establishes a www convention
// (frontend/app/vercel.json carries only the SPA rewrite, and there is no
// CNAME / redirect / domain configuration anywhere), so the apex host is the
// canonical one. Supersedes the retired www.aocprotocol.org origin.
// Static public assets (index.html, robots.txt, sitemap.xml) necessarily
// repeat this value literally — they cannot import it.
export const SOBERANIA_PROTOCOL_URL = 'https://soberaniaprotocol.org';

// The 1200x630 Open Graph / Twitter card. Versioned filename so LinkedIn, X
// and Slack re-scrape instead of serving a cached card; bump it whenever the
// image changes. index.html repeats this URL (with width/height/alt) for
// scrapers that don't run JS.
export const SOBERANIA_OG_IMAGE_URL = `${SOBERANIA_PROTOCOL_URL}/og/soberania-protocol-og-v2.png`;

export const FRONTERA_SYSTEMS_NAME = 'Frontera Systems';
export const FRONTERA_SYSTEMS_URL = 'https://frontera-systems.com';

// The canonical repository. Supersedes the retired
// Architects-of-Change-Protocol/Architects_of_Change_Protocol location, which
// is obsolete for every surface.
export const REPOSITORY_URL = 'https://github.com/Republika-Network/Soberania_Protocol';
export const PROTOCOL_PACKAGE_URL = `${REPOSITORY_URL}/tree/main/packages/protocol`;
