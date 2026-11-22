/** Offline request authentication only. No delegation, private derivation or network I/O. */
import { ed25519, x25519 } from "@noble/curves/ed25519";
import { base64urlnopad } from "@scure/base";

export const SEEDS_VAULT_REQUEST = "hm-seeds-key-vault-request";
export const SEEDS_REQUEST_MAX_CHARS = 8192;
/**
 * How far the phone's clock may be off, in either direction, when checking a
 * request's time window. Owner decision (2026-11-22): five minutes, because the
 * vault phone never syncs its clock.
 */
export const SEEDS_CLOCK_TOLERANCE_MS = 5 * 60_000;

export const SEEDS_POCKET = 1106;

/** Exact Seeds Key f5a315cf POCKET_COINS ordering. Not Vault's payment network list. */
export const SEEDS_POCKET_PATHS: readonly string[] = Object.freeze([
  "m/44'/696969'/1106'",
  "m/44'/969696'/1106'",
  "m/84'/0'/1106'",
  "m/44'/2'/1106'",
  "m/44'/60'/1106'",
  "m/44'/3'/1106'",
  "m/44'/145'/1106'",
  "m/44'/133'/1106'",
  "m/44'/144'/1106'",
  "m/44'/195'/1106'",
  "m/44'/501'/1106'/0'",
  "m/44'/5'/1106'",
  "m/44'/118'/1106'",
  "m/44'/931'/1106'",
  "m/1852'/1815'/1106'",
  "m/44'/128'/1106'",
]);

export type SeedsRequestTrust = Readonly<Record<string, string>>;
/**
 * SEEDS' production request-signing public key (Ed25519, 32 bytes, base64url).
 * Pinned 2026-11-22. SHA-256 of the decoded bytes:
 * b81366bf60017f6ce50379f3dea1868c18c311bec9ba31292116e6552163307c.
 * Four sources matched before pinning: the SEEDS release record
 * (docs/vault-request-signer.md), the live seeds.honest.money signer endpoint
 * (checked by a person; Vault never fetches it), the owner reading the
 * fingerprint on his own phone, and a recomputed fingerprint. Rotation adds a
 * new id alongside this one in a reviewed release; never edit a value in place.
 */
export const SEEDS_REQUEST_KEYS: SeedsRequestTrust = Object.freeze({
  "seeds-vault-2026-11": "KuDdTWX-bDwxkSff2lULKVwvUS_Dfa0tZLy_iWefuxc",
});

export interface SignedSeedsRequest {
  readonly type: typeof SEEDS_VAULT_REQUEST;
  readonly v: 2;
  readonly signing_key_id: string;
  readonly request_sig: string;
  readonly domain: string;
  readonly key_host: string;
  readonly challenge_id: string;
  readonly challenge: string;
  readonly recipient_pubkey: string;
  readonly pocket: number;
  readonly issued_at: string;
  readonly expires_at: string;
  readonly paths: readonly string[];
}

/** Exactly Seeds Key's vaultRequestBytes: UTF-8, fixed tuple, no trailing newline. */
export function seedsRequestBytes(r: Omit<SignedSeedsRequest, "request_sig">): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([
      "HME Seeds Vault request",
      r.type,
      r.v,
      r.signing_key_id,
      r.domain,
      r.key_host,
      r.challenge_id,
      r.challenge,
      r.recipient_pubkey,
      r.pocket,
      r.issued_at,
      r.expires_at,
      r.paths,
    ]),
  );
}

const BAD = "The Seeds request couldn't be verified. Start again on Seeds.";

function decode(value: string, size: number): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(BAD);
  let bytes: Uint8Array;
  try {
    bytes = base64urlnopad.decode(value);
  } catch {
    throw new Error(BAD);
  }
  if (
    bytes.length !== size ||
    base64urlnopad.encode(bytes) !== value ||
    !bytes.some((byte) => byte !== 0)
  )
    throw new Error(BAD);
  return bytes;
}

/** Pure verification seam for audited fixtures. App callers use readSeedsRequest instead. */
export function verifySignedSeedsRequest(
  value: unknown,
  trust: SeedsRequestTrust,
  now = Date.now(),
): SignedSeedsRequest {
  if (!Number.isFinite(now) || !value || typeof value !== "object" || Array.isArray(value))
    throw new Error(BAD);
  const x = value as Record<string, unknown>;
  const string = (name: string) => {
    const s = x[name];
    if (typeof s !== "string" || !s || s.length > 256) throw new Error(BAD);
    return s;
  };
  if (
    x["type"] !== SEEDS_VAULT_REQUEST ||
    x["v"] !== 2 ||
    x["pocket"] !== SEEDS_POCKET ||
    x["domain"] !== "seeds.honest.money" ||
    x["key_host"] !== "key.seeds.honest.money"
  )
    throw new Error(BAD);
  const paths = x["paths"];
  if (
    !Array.isArray(paths) ||
    paths.length !== SEEDS_POCKET_PATHS.length ||
    paths.some((path, i) => path !== SEEDS_POCKET_PATHS[i])
  )
    throw new Error(BAD);
  // Reconstruct rather than retain the caller's object or unverified display fields.
  const r: SignedSeedsRequest = Object.freeze({
    type: SEEDS_VAULT_REQUEST,
    v: 2,
    signing_key_id: string("signing_key_id"),
    request_sig: string("request_sig"),
    domain: "seeds.honest.money",
    key_host: "key.seeds.honest.money",
    challenge_id: string("challenge_id"),
    challenge: string("challenge"),
    recipient_pubkey: string("recipient_pubkey"),
    pocket: SEEDS_POCKET,
    issued_at: string("issued_at"),
    expires_at: string("expires_at"),
    paths: SEEDS_POCKET_PATHS,
  });
  if (
    !/^[A-Za-z0-9_-]{1,64}$/.test(r.signing_key_id) ||
    !/^[a-f0-9]{32}$/.test(r.challenge_id) ||
    !/^[a-f0-9]{48}$/.test(r.challenge)
  )
    throw new Error(BAD);
  const recipient = decode(r.recipient_pubkey, 32);
  // Public probe only: reject low-order recipients before any seed is touched.
  try {
    const probe = x25519.getSharedSecret(new Uint8Array(32).fill(9), recipient);
    probe.fill(0);
  } catch {
    throw new Error(BAD);
  }
  const issued = Date.parse(r.issued_at);
  const expires = Date.parse(r.expires_at);
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    new Date(issued).toISOString() !== r.issued_at ||
    new Date(expires).toISOString() !== r.expires_at ||
    expires <= issued ||
    expires - issued > 600_000
  )
    throw new Error(BAD);
  const key = Object.hasOwn(trust, r.signing_key_id) ? trust[r.signing_key_id] : undefined;
  if (!key)
    throw new Error(
      "This request was signed by a key this Vault doesn't trust. Update Vault, then start again on Seeds.",
    );
  let verified = false;
  try {
    verified = ed25519.verify(decode(r.request_sig, 64), seedsRequestBytes(r), decode(key, 32), {
      zip215: false,
    });
  } catch {
    throw new Error(BAD);
  }
  if (!verified) throw new Error(BAD);
  // An offline phone's clock drifts, so up to five minutes either way is allowed;
  // anything further off still fails closed.
  if (expires + SEEDS_CLOCK_TOLERANCE_MS <= now || issued > now + SEEDS_CLOCK_TOLERANCE_MS)
    throw new Error(
      "This Seeds request has expired or your clock is wrong. Check the phone's time.",
    );
  return r;
}

/** Size-bounded JSON parse shared by both readers below. */
function parseSeedsRequestText(text: string): unknown {
  if (text.length > SEEDS_REQUEST_MAX_CHARS) throw new Error(BAD);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(BAD);
  }
}

/** Production entry point: hard-wired to pinned trust. No key from a QR, UI or argument. */
export function readSeedsRequest(text: string): SignedSeedsRequest {
  return verifySignedSeedsRequest(parseSeedsRequestText(text), SEEDS_REQUEST_KEYS);
}

/**
 * Test/profile seam: verifies against explicitly supplied trust. Only a profile
 * passes this through, and the app never supplies a trust argument.
 */
export function readSeedsRequestWithTrust(
  text: string,
  trust: SeedsRequestTrust,
): SignedSeedsRequest {
  return verifySignedSeedsRequest(parseSeedsRequestText(text), trust);
}
