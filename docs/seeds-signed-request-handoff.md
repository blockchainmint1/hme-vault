# SEEDS / Seeds Key / Vault — signed-request coordination

Owner decision: Bobby, 2026-11-22 15:06 UTC, **Require signed requests**. Vault remains offline. No unsigned or manual-verification fallback.

## Current state

- Seeds Key `f5a315cf`: signed v2 protocol and scanner implemented, production verification keys deliberately absent.
- SEEDS `10288a21`: current sign-in submission checks can accept the existing inner handoff, but signed request issuance still needs implementation.
- Vault: `src/lib/signer/seeds-request.ts` prepares compatible offline authentication using the existing Noble 1.9.7 dependency. No key export/derivation, new screen or production trust key has been enabled.
- The exact ordered 16 paths are pinned locally and checked against the Key registry. This registry is not Vault's supported-payment network list and does not establish production spending support for every chain.

## Paste into the SEEDS project

Implement request issuance compatible with Seeds Key's existing `src/lib/seeds-key/vault-protocol.ts` and Vault's `src/lib/signer/seeds-request.ts`:

1. Provision a dedicated server-only **Ed25519** signing credential, separate from each request's **X25519** encryption keys. Use the project's secure secret setup; never put the private credential in source, browser manifests, audit output or QR codes. Vault needs only the authenticated public key and stable key ID.
2. Generate the request from stored, server-controlled challenge data, not caller-supplied recipients/paths/hosts. Include it as `vault_request` inside the existing manifest. The live domains must be `seeds.honest.money` and `key.seeds.honest.money`.
3. The signed object fields are exactly:
   `type`, `v`, `signing_key_id`, `request_sig`, `domain`, `key_host`, `challenge_id`, `challenge`, `recipient_pubkey`, `pocket`, `issued_at`, `expires_at`, `paths`.
4. Set type `hm-seeds-key-vault-request`, version `2`, pocket `1106`, and the ordered paths below. Set `challenge_id` to 32 lowercase hex characters, `challenge` to 48 lowercase hex characters; timestamps use canonical `Date.toISOString()` format. Expiration must be after issuance and no more than 600,000 ms later. The signing-key ID is 1–64 ASCII letters/digits/underscore/hyphen.
5. Sign **UTF-8 of the exact JSON tuple below** with ordinary Ed25519, not Ed25519ph or a second application-level hash. Do not add whitespace, BOM or trailing newline. Encode the 64-byte signature as canonical base64url without padding. The one-time recipient is a valid 32-byte X25519 public key with the same base64url encoding.
6. Preserve the inner TXC coin signature message and existing `hm-link-delegate v1` sealed payload format. Outer Vault response version is `2`. Keep existing challenge consumption, expiration, public/private key matching and authorization checks.
7. Return a reviewed handoff with: source commit, test results, stable signing-key ID, independently authenticated public key and its SHA-256 fingerprint, signed public test fixture, and key rotation procedure. **Do not return the signing private key.** Public-key authenticity must be established through the controlled project/release process rather than trusting a scanned key.

Canonical signed tuple:

```ts
JSON.stringify([
  "HME Seeds Vault request",
  type,
  v,
  signing_key_id,
  domain,
  key_host,
  challenge_id,
  challenge,
  recipient_pubkey,
  pocket,
  issued_at,
  expires_at,
  paths,
]);
```

Ordered paths (TXC, ISK, BTC, LTC, EVM, DOGE, BCH, ZEC, XRP, TRX, SOL, DASH, ATOM, RUNE, ADA, XMR):

```text
m/44'/696969'/1106'
m/44'/969696'/1106'
m/84'/0'/1106'
m/44'/2'/1106'
m/44'/60'/1106'
m/44'/3'/1106'
m/44'/145'/1106'
m/44'/133'/1106'
m/44'/144'/1106'
m/44'/195'/1106'
m/44'/501'/1106'/0'
m/44'/5'/1106'
m/44'/118'/1106'
m/44'/931'/1106'
m/1852'/1815'/1106'
m/44'/128'/1106'
```

Signing-key tests must prove field/recipient substitution fails, private signer and recipient secrets never enter browser output, account 0/1107 are refused, re-link stays on 1106, and canonical bytes agree across projects. A signed request does not establish who controls the receiving browser: retain the match-code check and require the owner to start the receiving Seeds screen themselves.

## Paste into the Seeds Key project

Your signed v2 implementation at `f5a315cf` matches the required direction. Keep `SEEDS_REQUEST_KEYS` empty until SEEDS provides an independently verified production public key. Then pin the same key ID/public key as Vault. Preserve the existing manifest field equality checks, revalidation before POST, 64-KB response cap, modern HMQR2 scanner, challenge matching and cancellation protections. Vault will use **240-character parts**, not 600. No test key, QR-supplied trust or unsigned fallback is allowed.

The Vault reference still omits the stored BIP39 passphrase and does not enforce hands-off seed restrictions. Do not treat that reference as ready to copy verbatim into Vault; a reviewed adapter is required. Key-side response validation can remain compatible because the derived identity/public keys are supplied in the signed response.

## Remaining Vault work after the upstream handoff

- Authenticate the production signer and pin the public key; import a production signed request fixture and verify it locally.
- Build the owner-confirmed per-seed export screen and pocket-only response adapter, preserving passphrases across identity, secp256k1, SLIP-0010 and Cardano derivation. Refuse hands-off seed exports at the callable boundary.
- Reverify immediately before derivation and before displaying the answer. Bind approval to the exact seed/request; cancel pending work on lock, close, expiry or selection change.
- Show trusted app name, match code, pocket/chain scope and explicit trading-authority warning. Recovery words and savings private keys never leave; no diagnostics, storage or network output of private data.
- Use 240-character HMQR2 replies, with existing pause/step/count controls.
- Run response interoperability and sealed-key decryption/key-matching tests, normal-payment regression tests, browser dummy-seed flow, independent audit, gated APK build and real phone-camera tests.

## Clock and key rotation

The updated Key protocol is strict: a request must be unexpired and issuance may be at most 60 seconds ahead of the local clock. Vault follows that v2 contract; a wrong offline clock requires correction, not an override. This supersedes the earlier uploaded v1 clock-warning instruction.

Distribute authenticated new public keys to Key and Vault before SEEDS starts signing with them; permit only a deliberate, reviewed overlap. A compromised retired key remains trusted by older offline APKs until updated. Do not fetch keys, accept QR-based trust-on-first-use or claim remote revocation can update a never-online Vault.

No SEEDS or Seeds Key changes can be pushed from this chat; their snapshots are read-only. Complete the two upstream steps in those projects and return the **public** handoff here.