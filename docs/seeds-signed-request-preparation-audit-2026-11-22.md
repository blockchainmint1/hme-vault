# HME Vault — signed Seeds request prerequisite: auditor handoff

Date: 2026-11-22. Owner approval: **Require signed requests**, 15:06 UTC.

## Scope and actual status

Added an offline authentication prerequisite, **not the full trading-key delegation feature**. No screen calls this new module yet. Production verification trust is intentionally empty, so `readSeedsRequest` refuses even a valid test-signed request. No real key export has been enabled, and no APK has been built or released.

Starting Vault head: `84bfff0`. Read-only source snapshots checked: Seeds Key `f5a315cf`, SEEDS `10288a21`. Seeds Key already implements signed v2; SEEDS still needs request-signing issuance/provisioning. The trust key must come from an independently authenticated production handoff, not a QR or the test fixture.

## Code changes

- `src/lib/signer/seeds-request.ts`: fixed-order v2 signed bytes; pocket-1106 ordered 16-path allowlist; strict host, token, timestamp and canonical encoding checks; valid X25519-recipient check using a public constant probe; Ed25519 signature verification with ZIP-215 disabled; strict expiry/60-second future-skew policy matching Key; immutable reconstructed output; 8,192-character scan cap; empty immutable production trust map and production reader with no trust-injection parameter.
- `src/lib/signer/seeds-request.test.ts`: 34 tests using an explicitly public deterministic fixture, including unsigned/forged/substituted requests, pocket 0/1107/2105, savings paths, missing production trust, QR-supplied key rejection, inherited trust entry rejection, exact-byte tuple, immutable output, exact expiry/skew boundaries, invalid dates/key encodings, low-order recipients, malformed JSON and size cap.
- `src/lib/signer/AGENTS.md`: separate offline module ownership and production trust-boundary rule. Root rules were not changed; the existing root file has no room for a new rule.
- `docs/seeds-signed-request-handoff.md`: exact upstream signing contract and copy/paste instructions for both other project chats; remaining Vault implementation and release gates.
- `docs/seeds-link-assessment-2026-11-22.md`: recorded the owner decision and new Key snapshot while preserving the earlier assessment context.
- `roadmap.md`: prerequisite complete, full feature explicitly blocked on the upstream handoff.
- Project memory records the owner-required signed-request rule, not an implementation claim.

The module uses the existing `@noble/curves` 1.9.7 Ed25519/X25519 APIs. No dependency/lockfile changes and no broad crypto upgrade. No private seed derivation, seal/export routine, storage, server function, backend import, native permission change or network code was added.

## Verification performed

- New verifier suite: **34/34 pass**.
- Entire Vault suite: **489/489 pass, 27 test files**.
- Changed-file ESLint: pass, no diagnostics.
- Prettier check for all changed source/rules/docs: pass.
- Cross-project executable check imported the actual Seeds Key `vault-protocol.ts` and `pockets/coins.ts` from `f5a315cf`: all 16 ordered paths and canonical bytes match; the same signed public test fixture is accepted by both readers.
- Existing content-route head metadata inspected: each content route contains its title/description/Open Graph/Twitter metadata. No route or page behavior changed.
- Preview build log and diff whitespace checked before completion. No manual build/typecheck was run; automatic preview validation remains separate from the test results.

The comparison uses the available installed Ed25519 implementation to execute both source modules, rather than installing the other project's dependency tree. It establishes actual source contract agreement, not a claim that the other project's complete production build/tests ran here.

## Remaining work and review points

1. SEEDS must securely provision a dedicated Ed25519 request signer, emit the signed v2 object from server-controlled manifest values, and deliver the stable key ID, independently verified public key/fingerprint and signed public fixture.
2. Pin that public key in both Key and Vault; do not use the public deterministic test key or accept trust from QR data. Key rotation needs authenticated releases; old offline APKs cannot receive instant revocation.
3. Build Vault's approval screen and response adapter after the handoff. At the response-builder boundary, forbid hands-off delegation, apply stored passphrases consistently, bind approval to seed/request and enforce lock/close/expiry guards. The upstream generic phrase-based builder is not copied verbatim because it currently ignores passphrases and cannot inspect Vault's hands-off metadata.
4. Replies remain 240-character HMQR2 parts. Full public pairing and ordinary payment signing stay unchanged.
5. Test sealed private/public-key matching, no mnemonic/savings leakage, failure cleanup and late completion before enabling export. Then complete independent audit, the gated APK build, zero-network-permission inspection and real phone-camera exchange.

Signed requests authenticate the encryption recipient but do not prove control of the receiving Seeds browser. Keep the match-code check and trusted fixed app name, and require a receiving screen started by the owner. Do not imply that revoking delegated access erases keys a recipient already copied.

## Not verified / not claimed

No production signing key exists in this checkout; no real SEEDS sign-in was submitted; no seed was exported; no complete delegation UI/browser/phone flow was exercised. The only completed flow is local signed-request verification with test-only data and both source readers. Do not publish this as working Seeds linking yet.