/**
 * Reusable "share a trading pocket" core.
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
import { assertPolicySound, assertScopeWithinPolicy, type BranchPolicy } from "./branch-policy";
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
  /** Reviewed, compiled-in limits: which pockets and the exact path list. */
  readonly policy: BranchPolicy;
  /** The pinned production trust. Changing it is a Vault release plus review. */
  readonly productionTrust: SeedsRequestTrust;
  /** Authenticates a scanned request; throws before any key is derived. */
  readRequest(text: string, trust?: SeedsRequestTrust): BranchRequest;
  /** Derives and seals the approved pocket. Re-checks the request first. */
  buildAnswer(request: BranchRequest, seed: SeedEntry): Promise<string>;
}

/** Re-authenticate an already-read request. A lapsed or swapped one never derives. */
function requireLive(request: BranchRequest): SignedSeedsRequest {
  return verifySignedSeedsRequest(request.verified, request.trust);
}

const SEEDS_POLICY: BranchPolicy = Object.freeze({
  pockets: Object.freeze([SEEDS_POCKET]),
  paths: SEEDS_POCKET_PATHS,
});

/**
 * The consequence the owner must read before approving. Shared by every
 * profile so a new service can't ship without it.
 */
export function branchConsequence(
  request: Pick<BranchRequest, "service" | "pocket" | "paths">,
): string[] {
  return [
    `${request.service} will hold the keys for all ${request.paths.length} chains in pocket ${request.pocket} and can spend from it until you move the coins out of it.`,
    `Revoking access on ${request.service} does not take the keys back.`,
    "Your savings and recovery phrase stay on this phone.",
  ];
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
      // The derivation must have produced exactly the scope the owner approved.
      if (
        h.body.paths.length !== request.paths.length ||
        h.body.paths.some((path, i) => path !== request.paths[i])
      )
        throw new Error("The keys didn't match the approved list, so nothing was handed over.");
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
  policy: SEEDS_POLICY,
  productionTrust: SEEDS_REQUEST_KEYS,
  readRequest(text, trust = SEEDS_REQUEST_KEYS) {
    const verified = readSeedsRequestWithTrust(text, trust);
    // Scope is settled here, before the approval screen and before any derivation.
    assertScopeWithinPolicy(verified.paths, verified.pocket, SEEDS_POLICY);
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
    if (!canRevealSeed(seed)) throw new Error("Hands-off copies can't share a trading pocket.");
    // Seeds' contract derives from the words alone; a passphrase seed would hand
    // over a different wallet than the one this Vault shows.
    if (seed.passphrase) throw new Error("Seeds with a passphrase can't share a trading pocket.");
    assertScopeWithinPolicy(request.paths, request.pocket, SEEDS_POLICY);
    requireLive(request);
    return seedsAnswer(request, seed);
  },
};

/** Every service Vault will consider. A new one is added here, not as a new screen. */
export const BRANCH_PROFILES: readonly BranchProfile[] = Object.freeze(
  [SEEDS_BRANCH_PROFILE].map((profile) => {
    // A profile whose own policy breaks the export rules never loads.
    assertPolicySound(profile.policy);
    return profile;
  }),
);

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

/**
 * The owner must type the seed's name exactly, as for "Give a copy", so a
 * mis-tapped seed choice can never hand over the wrong pocket.
 */
export function seedNameConfirmed(typed: string, seed: Pick<SeedEntry, "name">): boolean {
  return typed.length > 0 && typed === seed.name;
}

/** The approved answer for the chosen seed, as JSON ready for QR display. */
export async function buildBranchAnswer(
  request: BranchRequest,
  seed: SeedEntry,
  typedName: string,
): Promise<string> {
  if (!seedNameConfirmed(typedName, seed))
    throw new Error("Type the seed name exactly to hand over its pocket.");
  const profile = BRANCH_PROFILES.find((p) => p.id === request.profileId);
  if (!profile) throw new Error("That request is for a service this Vault doesn't support.");
  return profile.buildAnswer(request, seed);
}
