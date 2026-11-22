# HME Vault → Seeds: pre-implementation security assessment

Date: 2026-11-22. Status: **assessment only; implementation awaiting owner decision**.

## Reviewed inputs and recorded heads

- Uploaded `seeds-key-hme-vault-link-audit-note.md` and `hme-vault-link-instructions.md`.
- Vault: `a72e8a9`.
- Seeds Key: `c327e69f` (read-only workspace snapshot).
- SEEDS: `10288a21` (read-only workspace snapshot).
- Retrieved `https://honest.money/api` during review. This is agent-side research, not app network activity; the offline-only project rules override online integration guidance.

No application code, dependencies, native settings, release pointers or backend records changed. No APK built or publication performed. Neither other project can be edited through this chat's read-only snapshots.

## Intended authority

The uploaded instructions record Bobby's approval to disclose only account/pocket 1106 spending keys, encrypted to the request's X25519 public key, after sensitive-action approval. All 16 families are TXC, ISK, BTC, LTC, EVM, DOGE, BCH, ZEC, XRP, TRX, SOL, DASH, ATOM, RUNE, ADA and XMR. This is not proof that all 16 have production trading/signing support: several are marked planned in the registry.

Savings/account-0 private keys and mnemonic are not transmitted. A TXC identity signature uses account 0 locally, but the identity private key does not leave. Trading authority is broader than a signed payment: Seeds can spend from the delegated pocket without further Vault approval. Revocation cannot cryptographically erase a private key already copied by a recipient.

## Finding S1: request recipient is not authenticated

Seeds Key `src/lib/seeds-key/vault-link-reference.ts:18–28` checks literal host/domain fields, pocket and nonempty strings. No signature authenticates the request or its `recipient_pubkey`. `buildVaultResponse` at lines 32–40 seals to that supplied key through `buildHandoff`.

`src/lib/key-signin/rules.ts:145–150` computes the three-digit match code solely from the challenge. A substituted encryption key leaves that code unchanged. Host text and challenge-code comparison are not cryptographic proof of recipient identity.

The Key-side checks in `vault-link.ts:56–91` correctly bind the returned signature to the sealed payload and request challenge. SEEDS `src/lib/key-signin/submit.server.ts:35–60,76–89` checks the live stored request, opens with its own stored recipient key and consumes the challenge. These checks protect acceptance by SEEDS; they cannot undo trading-key disclosure to an attacker who supplied their own key and scanned the response.

**Recommended coordinated fix:** authenticate a versioned, canonical request with a SEEDS signing key. Bind domain, Key host, challenge ID, challenge, recipient encryption key, pocket, issue/expiry times and any displayed authorization-relevant app identity. Pin its verification key in Vault with an explicit rotation/release policy. Verify before showing approval or deriving private keys; reject missing/invalid signatures, field substitutions and unrecognized versions. The private signing key remains only on SEEDS, never in Vault or Seeds Key. This requires upstream changes and an updated compatibility test; do not fabricate a verification key or claim current v1 is authenticated.

Owner may instead explicitly accept existing trusted-browser/manual comparison with clear limitations. Never label that alternative as cryptographically sealed *only to Seeds*.

## Finding S2: existing seed passphrase is silently ignored

`seeds-key-reference.ts:71–80` derives the TXC identity without a passphrase; `buildHandoff` at lines 95–99 calls `pocketsFromMnemonic` without one. In contrast, `pockets/derive.ts:38–53` already supports passphrases, including Cardano's separate entropy-based derivation. Vault seeds have optional passphrases.

Do not copy these entry points verbatim and silently use a different wallet. Use an audited Vault adapter that consistently applies the stored passphrase to identity and every family, or explicitly refuse passphrase-bearing seeds until supported. Tests must verify passphrase-dependent identity and pocket keys across secp256k1, SLIP-0010 and Cardano, while keeping the no-passphrase coin identity vector unchanged.

## Finding S3: hands-off export prohibition must cover delegation

Vault `src/lib/vault/seeds.ts:58–72,76–87` refuses re-sharing and excludes hands-off seeds from exports. Delegating account private keys is an export even though it excludes the mnemonic. Refuse hands-off entries at the delegation boundary, not just by hiding a button. Ordinary watch-only pairing, receiving and payment signing remain available.

## Compatibility and implementation requirements

- Preserve Vault's 240-character outgoing QR policy instead of the suggested 600. Seeds Key's collector accepts variable part sizes; add exact-byte round-trip testing against its actual response reader with 240-character frames.
- The reference uses Noble curves 2.x APIs; Vault's direct curves dependency is 1.9.7. Isolate the reference's required version/imports rather than upgrading all existing payment signers without a regression audit. Verbatim copies also contain non-null assertions incompatible with Vault's coding rules; distinguish unchanged upstream references from a reviewed local adapter.
- Validate and cap every scanned field before approval; reject malformed public keys, low-order X25519 inputs, invalid timestamps and invalid challenge fields. Do not rely on later Key-side rejection to protect Vault.
- The response builder must revalidate the reviewed request and enforce pocket/family policy at the callable boundary, not only the parser.
- Use an owner credential/fingerprint confirmation bound to the selected seed and exact reviewed request. Cancellation, route close, lock and seed changes must discard pending responses; asynchronous completion must not restore data after lock. Clear exportable private buffers in finally blocks even on encryption failure; JavaScript strings cannot be guaranteed physically overwritten.
- Offline clock expiry remains advisory as proposed, with malformed date rejection; SEEDS performs authoritative expiration enforcement. Do not add network access or native navigation.
- Keep the existing full watch-only payload unchanged; this distinct, spending-authority flow must not be confused with public pairing.

## Required verification before release

Test fixed pocket 1106 versus 0/1107, exact 16-family/path allowlist, no mnemonic/savings private key in the response, successful sealed-payload decryption and key matching using test-only recipient keys, passphrase behavior, hands-off refusal, substituted recipient/challenge/host fields, malformed and oversized requests, failure cleanup and lock/close races. Verify the output using Seeds Key's real reader, then SEEDS acceptance with test inputs. Run Vault's existing safety suite. Browser flow uses dummy seeds only; final APK needs real phone/camera round-trip and zero-network-permission checks.

## Verification limits in this assessment

Source review only. No fresh claim of either upstream test count, no live SEEDS transaction/session test, no camera interoperability test, and no new feature safety tests run because no feature was implemented. Existing preview diagnostic files produced no error output during inspection. Independent auditor review remains a release gate.