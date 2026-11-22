/**
 * Reusable "share branch access" core.
 *
 * A service asks for one pocket by showing Vault a request it has signed with a
 * key Vault already trusts. Only after that request verifies does Vault derive
 * anything, and what it hands over is exactly the pocket the request named —
 * never the recovery words, the master key, the savings branch or any ancestor
 * private key. Adding a second service means adding a profile here, not a new
 * screen.
 *
 * Production trust (`SEEDS_REQUEST_KEYS`) is deliberately empty, so the app path
 * stays inert until a reviewed public key is pinned. Tests pass a fixture trust
 * to exercise the same code; the UI never supplies trust.
 */
import { pairingCode } from "@/lib/key-signin/rules";
import {
  buildHandoff,
  coinIdentityKey,
  signTxcMessage,
  type KeyManifest,
} from "@/lib/key-signin/seeds-key-reference";
import { canRevealSeed, type SeedEntry } from "@/lib/vault/seeds";
import {
  readSeedsRequestWithTrust,
  SEEDS_POCKET,
  SEEDS_POCKET_PATHS,
  SEEDS_REQUEST_KEYS,
  verifySignedSeedsRequest,
  type SeedsRequestTrust,
  type SignedSeedsRequest,
} from "./seeds-request";

/** Seeds' submit envelope: the body is unchanged from the Key page's own format. */
export const BRANCH_ANSWER_TYPE = "hm-seeds-key-vault-response";

/** A request Vault has already authenticated. Only `readRequest` builds one. */
export interface BranchRequest {
  readonly profileId: string;
  /** Trusted display name from the profile, never from the scanned QR. */
  readonly service: string;
  readonly pocket: number;
  readonly paths: readonly string[];
  readonly matchCode: string;
  readonly expiresAt: number;
  readonly verified: SignedSeedsRequest;
  /** The trust that authenticated this request; re-checked before deriving. */
  readonly trust: SeedsRequestTrust;
}

export interface BranchProfile {
  readonly id: string;
  readonly service: string;
  /** Authenticates a scanned request; throws before any key is derived. */
  readRequest(text: string, trust?: SeedsRequestTrust): BranchRequest;
  /** Derives and seals the approved pocket. Re-checks the request first. */
  buildAnswer(request: BranchRequest, seed: SeedEntry): Promise<string>;
}

/** Re-authenticate an already-read request. A lapsed or swapped one never derives. */
function requireLive(request: BranchRequest): SignedSeedsRequest {
  return verifySignedSeedsRequest(request.verified, request.trust);
}

function seedsAnswer(request: BranchRequest, seed: SeedEntry): Promise<string> {
  const r = request.verified;
  const manifest: KeyManifest = {
    type: "seeds-key-signin",
    version: 1,
    submit_url: "",
    domain: r.domain,
    key_host: r.key_host,
    challenge_id: r.challenge_id,
    challenge: r.challenge,
    recipient_pubkey: r.recipient_pubkey,
    pocket: SEEDS_POCKET,
    issued_at: r.issued_at,
    expires_at: r.expires_at,
  };
  const key = coinIdentityKey(seed.words);
  // The key has to outlive the async sealing, so it is cleared on every exit
  // path of the promise rather than in a synchronous finally.
  const finish = (error?: unknown): Promise<string> => {
    key.fill(0);
    if (error !== undefined) return Promise.reject(error);
    return Promise.reject(new Error("The answer couldn't be built."));
  };
  let identity: string;
  try {
    identity = signTxcMessage(key, "x").address;
  } catch (error) {
    return finish(error);
  }
  return buildHandoff({
    manifest,
    words: seed.words,
    kind: "coin",
    identity,
    account: SEEDS_POCKET,
  })
    .then(async (h) => {
      const signature = signTxcMessage(key, h.message).signature;
      // Derivation takes time; never display an answer whose request has lapsed.
      requireLive(request);
      key.fill(0);
      return JSON.stringify({
        type: BRANCH_ANSWER_TYPE,
        v: 2,
        challenge_id: r.challenge_id,
        message: h.message,
        signature,
        body: h.body,
      });
    })
    .catch(finish);
}

export const SEEDS_BRANCH_PROFILE: BranchProfile = {
  id: "seeds",
  service: "Seeds Exchange",
  readRequest(text, trust = SEEDS_REQUEST_KEYS) {
    const verified = readSeedsRequestWithTrust(text, trust);
    return {
      profileId: "seeds",
      service: "Seeds Exchange",
      pocket: SEEDS_POCKET,
      paths: SEEDS_POCKET_PATHS,
      matchCode: pairingCode(verified.challenge),
      expiresAt: Date.parse(verified.expires_at),
      verified,
      trust,
    };
  },
  async buildAnswer(request, seed) {
    if (request.profileId !== "seeds") throw new Error("That request is for a different service.");
    if (!canRevealSeed(seed)) throw new Error("Hands-off copies can't hand over branch access.");
    requireLive(request);
    return seedsAnswer(request, seed);
  },
};

/** Every service Vault will consider. A new one is added here, not as a new screen. */
export const BRANCH_PROFILES: readonly BranchProfile[] = Object.freeze([SEEDS_BRANCH_PROFILE]);

/**
 * Authenticate a scanned request against the pinned trust of every profile.
 * Nothing is derived here, and a request no profile signs for is refused.
 * The app always calls this without a trust argument.
 */
export function readBranchRequest(text: string, trust?: SeedsRequestTrust): BranchRequest {
  let firstError: unknown;
  for (const profile of BRANCH_PROFILES) {
    try {
      return profile.readRequest(text, trust);
    } catch (error) {
      if (firstError === undefined) firstError = error;
    }
  }
  throw firstError instanceof Error ? firstError : new Error("That request couldn't be verified.");
}

/** The approved answer for the chosen seed, as JSON ready for QR display. */
export async function buildBranchAnswer(request: BranchRequest, seed: SeedEntry): Promise<string> {
  const profile = BRANCH_PROFILES.find((p) => p.id === request.profileId);
  if (!profile) throw new Error("That request is for a service this Vault doesn't support.");
  return profile.buildAnswer(request, seed);
}
