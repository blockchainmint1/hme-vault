# Reusable branch-access sharing: assessment for independent review

Date: 2026-11-22 UTC. Status: recommendation only; no application changes, broader export authority, APK build or publication.

## Owner direction

Bobby prefers a reusable “Share branch access” flow instead of a separate “Link to SEEDS” feature for each ecosystem service. The first use case remains pocket 1106. This is not permission to release arbitrary branches or trust QR-supplied signing keys.

## Recommended experience

Choose a seed, scan an authenticated service request, review the requested pocket and exact coin families/paths, confirm with the existing sensitive-action credential, and show an answer encrypted to that verified request's recipient in rotating 240-character HMQR2 frames. Permit only the intersection of reviewed local policy, signed request scope and owner approval. A local selection cannot rewrite an existing signed request: a different pocket requires a matching signed request and compatible receiver.

1106 is an account/pocket index, not a single complete derivation path. The existing SEEDS contract requests 16 ordered paths across different derivation families. Those paths and export formats must remain unchanged for SEEDS interoperability. Public pairing remains separate and public-only.

## Security implications for review

- Branch private-key sharing delegates spending authority; it is not remote signing with per-payment approval. A recipient can copy keys after decryption. Revoking a service session does not revoke those keys; a compromise requires moving funds to independent keys.
- Keep recovery words, BIP39 passphrases, master private keys, savings keys and private ancestors of approved accounts on the phone. Reject broad/root/ancestor exports. For BIP32, account-level hardened isolation matters; arbitrary non-hardened child-private exports combined with parent public material can undermine ancestor secrecy.
- Do not apply BIP32 assumptions universally: SLIP-0010, Cardano and the shared Monero contract need their own reviewed derivation and output rules.
- Authenticate the receiving service and bind recipient, paths, challenge and expiry before touching secret derivation. Encryption alone does not establish the recipient's identity. Preserve code comparison and owner-started-session warnings; genuine-request forwarding remains a separate risk.
- Preserve hands-off refusal at the callable export boundary, stored passphrase correctness, immutable request binding, signature/expiry rechecks, lock/cancel/close/selection generation guards and best-effort mutable-buffer wiping.
- Shared UI and encryption machinery can reduce repeated work. New services still require an audited way to establish trust, compatible response contracts and scope policies. Do not promise that every future service can be enabled without a Vault release. An offline signed service catalog would itself require a reviewed root-of-trust, rollback, revocation and import design; none is approved or implemented here.
- Do not relax APK zero-network-permission policy, add online discovery, or accept unsigned/manual-recipient fallbacks.

## Fresh status check

Read-only snapshots: SEEDS `25311bc7`; Seeds Key `f486ac28`. Vault's current `src/lib/signer/seeds-request.ts` remains signed-v2 authentication only, fixed to live SEEDS hosts and the ordered pocket-1106 paths, with an empty production signer trust map.

Source searches of the SEEDS snapshot found no `vault_request` or `signing_key_id` implementation and no request-signer public handoff. Seeds Key's testing handoff still describes SEEDS request signing and independently authenticated public-key provisioning as prerequisites. This establishes that completion was not verified in the available snapshots; it does not establish the state of a deployment, another branch or external signing service.

## Next implementation scope

Use one reusable screen and reviewed export machinery with the existing SEEDS v2 adapter as the first supported profile. Do not change SEEDS's signed tuple or response contract merely to rename the Vault screen. Before adding additional scopes/services, coordinate authenticated request formats and receiver compatibility, define isolation policy, and obtain independent review.

Existing required tests remain: all-family empty/nonempty-passphrase vectors, exact export scope, direct-call restrictions, authentication-before-derivation, time boundaries, cross-project sealing/signature compatibility, lifecycle invalidation, QR limits and pairing/backup/payment regressions. No new tests were run for this discussion because no executable code changed. Live link completion and phone acceptance remain unverified.