---
"@aoc/protocol": minor
---

Security (SOBE-SEC-01, N1): issuer binding is always evaluated for the issuer the signed content names.

`verifySovereignManifest` and `verifySignedSovereignClaim` accept an optional `issuer`, and
AOC.VERIFIABILITY accepts an optional `issuerId`. These values previously replaced the issuer named
in the signed manifest (`registrant`) or claim (`issuer`) as the identity the binding check resolved.
They are now an expected issuer: they can narrow the acceptable identity, never replace it.

- The issuer resolved and bound is always the signed one: a string, or a `CanonicalPrincipalRef`'s
  `id`.
- An expected issuer that is not exactly equal to it — including when the signed content names no
  issuer — makes `issuerBinding` `unverified` with `ISSUER_BINDING_UNVERIFIED` and
  `ISSUER_BINDING_ISSUER_MISMATCH`, so `valid` is `false`. The `VerificationKeyResolver` is not
  consulted in that case.
- Without an expected issuer, behaviour is unchanged.

Compatibility: this is a caller-visible semantic change, classified minor. A caller that passed an
`issuer` / `issuerId` different from the signed one now gets `unverified` instead of a binding for the
value it passed. The comparison is exact: values differing only in case, whitespace or Unicode
normalization do not match. A blank or non-string expected issuer is now a mismatch for the library
functions (previously an empty string reported `not_performed`); AOC.VERIFIABILITY already rejected a
blank `issuerId` as malformed input. No export, type, field or reason code is added or removed.

Treat a result as authenticating its issuer only when `checks.issuerBinding` is `'verified'`; `valid`
alone reports that every check that ran passed, and `issuerBinding` is `not_performed` when no
resolver is supplied or no issuer can be resolved.
