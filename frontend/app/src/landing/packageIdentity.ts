// SOB-PUBLIC-ALIGN-01E (QA-02): the package names the public site documents.
//
// The approved public names are the primary identity. They are NOT published
// on npm yet, so no surface may present an install command for them. The
// legacy names are the local workspace names on public main; the
// build-from-source steps must keep using them until the repository itself is
// migrated. This module only names them for display: package metadata lives
// in packages/*/package.json and is not changed by the site.
export const PACKAGE_NAMES = {
  protocol: '@soberania-protocol/protocol',
  sdk: '@soberania-protocol/sdk',
  legacyProtocolWorkspace: '@aoc/protocol',
  legacySdkWorkspace: '@aoc/sdk',
} as const;
