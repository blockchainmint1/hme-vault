# Branch access handoff (reusable service linking)

Vault can hand a service the keys for one pocket so that service can sign on the
owner's behalf. This is deliberately the **broadest** authority Vault grants: the
service receives spendable private keys, and a key that has been copied cannot be
taken back. Everything below exists to keep that one act narrow.

## One flow, many services

The screen is `/branch-access` ("Share branch access" on the Seeds list). It is
not written for one service. Each service is a **profile** in
`src/lib/signer/branch-access.ts`, and a profile pins:

- the request type string it accepts;
- the trust keys that may sign that service's requests;
- the pocket it may ask for (SEEDS: account **1106** only);
- the exact ordered coin/path list it may receive;
- how the answer is built.

Adding a second service means adding one profile object plus its tests. The
review screen, warnings, seed picker, confirmation, rotating QR answer and
lifetime guards are shared. No service gets its own screen, and no service gets
a derivation path the profile did not pin.

## What the service must send

A request must be JSON, signed by a key Vault already trusts, and must contain:

- `type`, `v: 2`, `signing_key_id`
- `domain`, `key_host`, `challenge_id`, `challenge`
- `recipient_pubkey` — the service's X25519 key; the answer is sealed to it
- `pocket` (1106) and `paths` — the full ordered path list
- `issued_at`, `expires_at` — at most ten minutes apart, issued no more than
  sixty seconds in the future

Vault refuses: an unknown signing key, a tampered signature, an expired or
not-yet-valid window, a pocket other than 1106, a path list that differs from
the profile's, or a request over the size limit. A refusal never reveals which
check failed except for the deliberate "waiting for Seeds' verified signing
key" message, which tells the owner the link is not provisioned yet.

## What the owner sees

1. Scan or paste the request on the service's own screen.
2. A short **match code** plus the service name, pocket and the full coin list,
   so the owner can compare it against what the service displayed.
3. An explicit warning that this hands over spending authority and cannot be
   undone.
4. A seed picker. Hands-off seeds are excluded — a copy that was given away
   cannot be handed on again.
5. Confirmation with the Vault password, or fingerprint when enrolled.
6. Rotating 240-character QR frames containing the sealed answer, with an
   expiry countdown and a stop control.

## What the service receives

The answer is `hm-seeds-key-vault-response` v2:

- `challenge_id`, `message`, `signature` — a Bitcoin-style signature from the
  pocket's TXC identity, binding the answer to the challenge;
- `body` — the pocket's xprv map, sealed with X25519 + AES-256-GCM to the
  request's `recipient_pubkey` (`eph(32) ‖ nonce(12) ‖ ciphertext+tag`).

Seventeen chains are covered by the pinned list: TXC, ISK, BTC, LTC, EVM, DOGE,
BCH, ZEC, XRP, TRX, SOL, DASH, ATOM, RUNE, ADA, XMR. The answer is never
persisted, never added to a backup, and is dropped when the screen is left or
Vault locks.

## What is still missing before this can be used live

`SEEDS_PROFILE.trust` is **empty**. Until SEEDS supplies an independently
verified signing public key, every real request is refused. That is the intended
state, not a bug.

To turn it on, someone must:

1. Obtain SEEDS' signing public key out of band (not from a QR, not from the
   request).
2. Verify it against SEEDS' own published record.
3. Pin it in `src/lib/signer/branch-access.ts` with its key id and date.
4. Re-run the safety suite and get an independent audit of the pinned value.

Then a funded test on a real phone: request from SEEDS, scan, confirm, and check
that SEEDS can actually spend from the pocket it received.

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
