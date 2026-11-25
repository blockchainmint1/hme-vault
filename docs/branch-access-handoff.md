# Branch access handoff (reusable service linking)

Vault can hand a service the keys for one pocket so that service can sign on the
owner's behalf. This is deliberately the **broadest** authority Vault grants: the
service receives spendable private keys, and a key that has been copied cannot be
taken back. Everything below exists to keep that one act narrow.

## One flow, many services

The screen is `/branch-access` ("Share a trading pocket" on the Seeds list). It is
not written for one service. Each service is a **profile** in
`src/lib/signer/branch-access.ts`, and a profile pins:

- the request type string it accepts;
- the trust keys that may sign that service's requests;
- a `BranchPolicy`: the pockets it may ask for (SEEDS: account **1106** only)
  and the exact ordered coin/path list it may receive;
- how the answer is built.

Adding a second service means adding one profile object plus its tests. The
review screen, warnings, seed picker, confirmation, rotating QR answer and
lifetime guards are shared. No service gets its own screen, and no service gets
a derivation path the profile did not pin.

## Export rules every profile must pass (`branch-policy.ts`)

- Only fully hardened nodes at depth 3 or deeper are ever handed over: the
  account xprv for BIP32 coins, the hardened leaf for SLIP-0010 (Solana), the
  account key for Cardano, the spend key for Monero.
- Account 0 (savings) is refused, as is any account the profile's policy does
  not list.
- No requested path may be a parent of another requested path, and duplicates
  are refused.
- A profile whose own policy breaks these rules never loads.
- The approved export scope must equal the policy's list exactly before the review
  screen appears. It is never widened or reduced. Seeds may request a signed
  superset for future coins; those extra paths are displayed as unavailable and
  are never derived or included in the answer.
- After derivation, the derived path list must equal the approved list before
  anything is signed.
- Seeds with a BIP39 passphrase (extra password) are supported. Vault passes
  the stored password unchanged to Seeds Key's own copied `coinIdentityKey` and
  `buildHandoff`, which normalise it once (NFKD) and use it for the identity and
  all 16 families, Cardano included. The password never appears in the answer.
  Vault writes no passphrase-aware derivation of its own. Tests check the
  identity against the official BIP39 "TREZOR" vector seed and against the first
  TXC address Vault itself shows for that seed, and check that composed and
  decomposed accented passwords produce the same pocket.

## What the service must send

A request must be JSON, signed by a key Vault already trusts, and must contain:

- `type`, `v: 2`, `signing_key_id`
- `domain`, `key_host`, `challenge_id`, `challenge`
- `recipient_pubkey` — the service's X25519 key; the answer is sealed to it
- `pocket` (1106) and `paths` — the exact received order is authenticated; it must
  include every existing path, with no duplicates or ancestor/descendant overlap,
  at most 40 paths, each fully hardened on pocket 1106, depth 3–6, purpose
  44/84/1852 and canonical component numbers of at most nine digits
- `issued_at`, `expires_at` — at most ten minutes apart, issued no more than
  five minutes in the future; the offline phone may also be up to five minutes
  past the stated expiry, with refusal at expiry plus five minutes

Vault refuses: an unknown signing key, a tampered signature, an expired or
not-yet-valid window, a pocket other than 1106, missing existing paths,
unsafe/overlapping/duplicate paths, or a request over the size limit. A refusal never reveals which
check failed except for the deliberate "signed by a key this Vault doesn't
trust" message, which tells the owner to update Vault (for example after a key
rotation).

## What the owner sees

1. Scan or paste the request on the service's own screen.
2. A short **match code** plus the service name, pocket and the full coin list,
   so the owner can compare it against what the service displayed. If a newer
   Seeds requested additional coins, their paths appear in a separate notice:
   those keys will not be shared; only the existing 16-chain list is included.
3. The mandatory consequence sentences (shared by every profile): the service
   can spend from the pocket until the coins are moved out, and revoking access
   on the service does not take the keys back. The exact paths are one tap away.
4. A seed picker. Hands-off seeds are excluded.
5. Typing the seed's exact name (as for "Give a copy"), then confirmation with
   the Vault password, or fingerprint when enrolled.
6. A private record ("pocket 1106 · Seeds Exchange · date") is saved inside the
   encrypted Vault first; if it cannot be saved, nothing is shown. It appears on
   the seed's page and the Seeds list, travels in the owner's backups and never
   in shared copies.
7. Rotating 240-character QR frames containing the sealed answer, with an
   expiry countdown and a stop control.

## Cancellation safeguards

Each approval is a ticket (`HandoverGuard`) bound to the exact verified request
object and the chosen seed. These all cancel it: Cancel, leaving the screen,
locking Vault (the screen unmounts), choosing a different seed, the request's
expiry, and starting a new approval. `handOverPocket` checks the ticket:

1. before deriving anything (and refuses a seed other than the approved one);
2. after the pocket is derived and sealed. A cancelled ticket drops the answer
   and records nothing;
3. after the private record is saved;
4. after a final signature-and-expiry re-check of the request.

Only then is the answer displayed. The screen also checks the ticket before
showing errors or clearing the busy state, so a stale run cannot change what the
owner sees. Known limit: cancelling *while the record is being saved* leaves
the record in place although no codes were shown. That errs on the side of
caution. Derivation itself runs in one uninterrupted step, so the UI cannot
accept a tap until it finishes. After that, the checks above decide.

## What the service receives

The answer is `hm-seeds-key-vault-response` v2:

- `challenge_id`, `message`, `signature` — a Bitcoin-style signature from the
  pocket's TXC identity, binding the answer to the challenge;
- `body` — the pocket's xprv map, sealed with X25519 + AES-256-GCM to the
  request's `recipient_pubkey` (`eph(32) ‖ nonce(12) ‖ ciphertext+tag`).
- `body.vault_fingerprint` and `body.vault_label_signature` — optional display
  metadata so the service can name the account `Vault <id>` using the same
  eight-character seed ID Vault shows beside the seed name. The ID is the BIP32
  master fingerprint (lowercase hex, zero-padded), recomputed from the words and
  stored extra password at hand-over time, never read from storage. The label
  signature is a second TXC message signature by the same identity over
  `JSON.stringify(["HME Vault seed label", 1, message, vault_fingerprint])`
  (Seeds Key's `vault-label.ts`, copied byte for byte), so it cannot be moved to
  another hand-over. The original message, signature, `kind`, identity, pocket,
  paths and sealed payload are unchanged; services that predate the label ignore
  it. The ID is 32 bits and display-only: it must never decide login, ownership,
  matching or derivation. It is the only extra seed information disclosed, and
  the review screen tells the owner it will be shared.

Sixteen chains are covered by the pinned list: TXC, ISK, BTC, LTC, EVM, DOGE,
BCH, ZEC, XRP, TRX, SOL, DASH, ATOM, RUNE, ADA, XMR. The answer is never
persisted, never added to a backup, and is dropped when the screen is left or
Vault locks.

## Forward compatibility with Seeds' new coins (2026-11-25)

The request reader is adapted from Seeds' HK3-reviewed `vault-protocol.ts`
(SHA-256 `1329b5a87994ec56fbacad19d71fefe27dffc4dca5e16e18306091cdf67107bb`),
not substituted wholesale. Vault retains immutable validated fields, its pinned
KMS signing key, five-minute clock tolerance, and low-order X25519 recipient
rejection. Both signatures continue to use the original message formats.

`verified.paths` is the complete authenticated requested list. `BranchRequest.paths`
is the exact pinned supported export list, in its original order. The extra paths
are never passed to derivation; the answer's paths and sealed private/public maps
remain exactly the existing 16 entries. Every liveness re-check authenticates the
complete requested list again and verifies the approved export scope.

Vault already hands over EVM, ADA (plain Icarus) and XMR keys on every link/re-link.
HYPE on HyperEVM and AVAX on Avalanche C-Chain reuse the EVM key at
`m/44'/60'/1106'`, receive child `0/0`; no HyperCore support is implied.
Vault can derive hardened ed25519 SLIP-0010 keys, but XLM, TON and SUI exports
remain absent pending Seeds' written acceptance go-ahead and independently
verified derivation/address vectors. Ordinary offline payment signing is unchanged.

Coordinated release check: Seeds and Seeds Key must accept the existing 16-key
answer to an expanded signed request and retain every previous key on re-link.
Their reference copy/version update and live activation are outside this project.
An exact-expanded-answer requirement on either receiver still blocks linking and
must be addressed there, not by secretly exporting extra keys here.

The newer browser `buildHandoff` requires a real manifest URL and submit URL;
Vault's offline signed request does not contain that online manifest contract.
The copied derivation/sealing modules and package versions are unchanged in this
compatibility preparation: no invented URL, fetch, auth middleware or library
migration is introduced.

## SEEDS' pinned signing key

Pinned on 2026-11-23 in `SEEDS_REQUEST_KEYS` (`src/lib/signer/seeds-request.ts`).
The private half lives in AWS KMS (us-east-1) and never leaves AWS:

| Field | Value |
|---|---|
| `signing_key_id` | `seeds-vault-kms-2026-11` |
| Public key (Ed25519, base64url, 32 bytes) | `6_06ZOHGeDeGX7O1ToRTAmdiGs0_AOSSX70VbTd9IjA` |
| SHA-256 of the decoded bytes | `0556577f852b0cf2a05a1c75ecbf806e6657ce193393d9e800137b6537c86d4d` |

All four checks in SEEDS' release record matched before pinning: the record
itself (`docs/vault-request-signer.md` in SEEDS, commit `582c6f71`), the live
`seeds.honest.money/api/public/key-signin/vault-signer` endpoint (checked by a
person; Vault never fetches it), the owner reading the full fingerprint from
his own device, and a recomputed fingerprint.

The earlier key `seeds-vault-2026-11` (`b81366bf…2163307c`, pinned 2026-11-22)
was removed in the same change at the owner's decision: SEEDS deleted its
server secret and no member relied on it. Its signed example is kept at
`src/lib/signer/fixtures/seeds-retired-key-example-request.json` and a test
proves it is now refused. SEEDS' production-signed, already-expired
example is kept at `src/lib/signer/fixtures/seeds-production-example-request.json`
and verifies at its own clock, which proves Vault's canonical bytes match the
real signer.

Before members use it: independent review of the pin, a gated APK build, and a
phone round-trip with a disposable, unfunded seed (request from SEEDS, scan,
confirm, and check that SEEDS received the pocket).

Rotation follows SEEDS' record: add the new id beside the old one in a reviewed
release, wait for an audited overlap so offline phones update, then remove the
old id.

## Reserved for the next contract version

Bind a hash of the signed request tuple into the sealed answer's AES-GCM
associated data, so a payload sealed for one request can never be presented
against another. Not needed for v2 because recipient keys are one-time; changing
it now would break SEEDS and Seeds Key.

## Guarantees and their limits

- The owner's recovery words, master key, savings keys and private ancestors
  never leave the phone. Only the pocket's own keys are handed over.
- The answer only opens for the service that asked, because it is sealed to that
  request's recipient key.
- A stale or replayed request cannot produce an answer: expiry, issued-at skew
  and a re-check immediately before sealing.
- **Not** a guarantee: once the service holds the pocket keys, Vault cannot
  revoke them, watch them, or tell what it did with them. That is why the screen
  says so out loud and why the pocket is a trading pocket, not the savings
  pocket.
