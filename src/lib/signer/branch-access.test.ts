/**
 * Branch-access gating. Every request here is signed by a public, deterministic
 * test key that is never installed in production trust; the app path is checked
 * separately to prove it stays inert until a reviewed key is pinned.
 */
import { describe, expect, it } from "vitest";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64urlnopad } from "@scure/base";
import { accountPath, POCKET_COINS } from "@/lib/pockets/coins";
import {
  BRANCH_ANSWER_TYPE,
  BRANCH_PROFILES,
  buildBranchAnswer,
  readBranchRequest,
} from "@/lib/signer/branch-access";
import {
  readSeedsRequest,
  SEEDS_POCKET_PATHS,
  SEEDS_REQUEST_KEYS,
  SEEDS_VAULT_REQUEST,
  seedsRequestBytes,
} from "@/lib/signer/seeds-request";
import type { SeedEntry } from "@/lib/vault/seeds";

const TEST_SIGNING_SECRET = new Uint8Array(32).fill(42);
const TEST_TRUST = {
  "test-only": base64urlnopad.encode(ed25519.getPublicKey(TEST_SIGNING_SECRET)),
};
const RECIPIENT_SECRET = new Uint8Array(32).fill(7);
const RECIPIENT_PUB = base64urlnopad.encode(x25519.getPublicKey(RECIPIENT_SECRET));

const WORDS =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function seed(over: Partial<SeedEntry> = {}): SeedEntry {
  return {
    id: "s1",
    name: "Trading",
    words: WORDS,
    fingerprint: "00000000",
    createdAt: 0,
    ...over,
  };
}

/** Mirrors Seeds Key's fixture: a live, correctly signed request unless overridden. */
function signedRequest(over: Record<string, unknown> = {}) {
  const now = Date.now();
  const r = {
    type: SEEDS_VAULT_REQUEST,
    v: 2,
    signing_key_id: "test-only",
    domain: "seeds.honest.money",
    key_host: "key.seeds.honest.money",
    challenge_id: "a".repeat(32),
    challenge: "c".repeat(48),
    recipient_pubkey: RECIPIENT_PUB,
    pocket: 1106,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + 600_000).toISOString(),
    paths: POCKET_COINS.map((c) => accountPath(c, 1106)),
    ...over,
  };
  return JSON.stringify({
    ...r,
    request_sig: base64urlnopad.encode(
      ed25519.sign(seedsRequestBytes(r as never), TEST_SIGNING_SECRET),
    ),
  });
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** What SEEDS does with the sealed payload: open it with its one-time key. */
async function openPayload(payload: string): Promise<Record<string, string>> {
  const sealed = base64urlnopad.decode(payload);
  const eph = sealed.slice(0, 32);
  const nonce = sealed.slice(32, 44);
  const ct = sealed.slice(44);
  const recipient = x25519.getPublicKey(RECIPIENT_SECRET);
  const shared = x25519.getSharedSecret(RECIPIENT_SECRET, eph);
  const key = hkdf(
    sha256,
    shared,
    concat(eph, recipient),
    new TextEncoder().encode("hm-link-delegate v1"),
    32,
  );
  const k = await crypto.subtle.importKey("raw", Uint8Array.from(key), "AES-GCM", false, [
    "decrypt",
  ]);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, k, Uint8Array.from(ct)),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, string>;
}

describe("the app path stays inert until a reviewed key is pinned", () => {
  it("production trust is empty", () => {
    expect(Object.keys(SEEDS_REQUEST_KEYS).length).toBe(0);
  });

  it("a correctly signed request is still refused without a pinned key", () => {
    expect(() => readBranchRequest(signedRequest())).toThrow(
      /waiting for Seeds' verified signing key/,
    );
  });

  it("only the Seeds profile exists today", () => {
    expect(BRANCH_PROFILES.map((p) => p.id)).toEqual(["seeds"]);
  });

  it("every profile's production trust holds only reviewed key ids", () => {
    // Pinning a key means updating this table in the same reviewed change.
    const REVIEWED: Record<string, string[]> = { seeds: [] };
    expect(BRANCH_PROFILES.map((p) => p.id).sort()).toEqual(Object.keys(REVIEWED).sort());
    for (const p of BRANCH_PROFILES) {
      expect(Object.keys(p.productionTrust).sort()).toEqual(REVIEWED[p.id]);
      expect(p.productionTrust).toBe(SEEDS_REQUEST_KEYS);
    }
  });
});

describe("a verified request names exactly one pocket", () => {
  it("accepts a live signed request and shows the owner the match code", () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    expect(r.service).toBe("Seeds Exchange");
    expect(r.pocket).toBe(1106);
    expect(r.paths).toEqual(SEEDS_POCKET_PATHS);
    expect(r.matchCode).toBe("673");
    expect(r.expiresAt).toBeGreaterThan(Date.now());
  });

  it("refuses a tampered signature", () => {
    const text = signedRequest();
    const broken = text.replace(
      /"request_sig":"([^"]+)/,
      (_m, s: string) => `"request_sig":"${s.slice(0, -2)}zz"`,
    );
    expect(() => readBranchRequest(broken, TEST_TRUST)).toThrow();
  });

  it("refuses an expired request", () => {
    const now = Date.now();
    expect(() =>
      readBranchRequest(
        signedRequest({
          issued_at: new Date(now - 900_000).toISOString(),
          expires_at: new Date(now - 1_000).toISOString(),
        }),
        TEST_TRUST,
      ),
    ).toThrow();
  });

  it("refuses a savings pocket and a look-alike path list", () => {
    expect(() => readBranchRequest(signedRequest({ pocket: 0 }), TEST_TRUST)).toThrow();
    expect(() =>
      readBranchRequest(
        signedRequest({ paths: POCKET_COINS.map((c) => accountPath(c, 1107)) }),
        TEST_TRUST,
      ),
    ).toThrow();
    expect(() =>
      readBranchRequest(signedRequest({ paths: SEEDS_POCKET_PATHS.slice(0, 15) }), TEST_TRUST),
    ).toThrow();
  });

  it("refuses a request signed by an unpinned key id", () => {
    expect(() =>
      readBranchRequest(signedRequest({ signing_key_id: "other" }), TEST_TRUST),
    ).toThrow();
  });
});

describe("the approved answer", () => {
  it("refuses a hands-off copy before deriving anything", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    await expect(buildBranchAnswer(r, seed({ handsOff: true }))).rejects.toThrow(/hands-off/i);
  });

  it("refuses a seed with a passphrase, whose pocket would be a different wallet", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    await expect(buildBranchAnswer(r, seed({ passphrase: "extra" }))).rejects.toThrow(
      /passphrase/i,
    );
  });

  it("refuses an approved request whose scope was altered after reading", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    const widened = { ...r, paths: [...r.paths, "m/44'/0'/1106'"] };
    await expect(buildBranchAnswer(widened, seed())).rejects.toThrow();
  });

  it("carries only Seeds' envelope fields and never the recovery words", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    const answer = await buildBranchAnswer(r, seed());
    const parsed = JSON.parse(answer) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      ["body", "challenge_id", "message", "signature", "type", "v"].sort(),
    );
    expect(parsed.type).toBe(BRANCH_ANSWER_TYPE);
    expect(parsed.v).toBe(2);
    expect(parsed.challenge_id).toBe("a".repeat(32));
    expect(answer).not.toContain("abandon");
    const body = parsed.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["account", "identity_address", "kind", "paths", "payload", "token", "xpubs"].sort(),
    );
    expect(body.account).toBe(1106);
    expect(body.kind).toBe("coin");
    expect(body.paths).toEqual(SEEDS_POCKET_PATHS);
  });

  it("seals exactly the 16 pocket keys and nothing else", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    const answer = await buildBranchAnswer(r, seed());
    const body = (JSON.parse(answer) as { body: { payload: string } }).body;
    const xprvs = await openPayload(body.payload);
    expect(Object.keys(xprvs).sort()).toEqual([...POCKET_COINS].sort());
    for (const v of Object.values(xprvs)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(20);
      expect(v).not.toContain("abandon");
    }
  });

  it("binds the answer to the request's own recipient and identity", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    const answer = await buildBranchAnswer(r, seed());
    const parsed = JSON.parse(answer) as { body: { payload: string; identity_address: string } };
    // Opens only with the one-time key the request named, and names the identity
    // the owner was shown.
    const xprvs = await openPayload(parsed.body.payload);
    expect(Object.keys(xprvs).length).toBe(16);
    expect(parsed.body.identity_address).toBe("TZZCuca5ntPVCJL5ryTjh465Jvw5vHxsVd");
  });

  it("refuses to answer a request that lapsed while the owner was deciding", async () => {
    const now = Date.now();
    const r = readBranchRequest(
      signedRequest({
        issued_at: new Date(now - 500_000).toISOString(),
        expires_at: new Date(now + 200).toISOString(),
      }),
      TEST_TRUST,
    );
    await new Promise((res) => setTimeout(res, 400));
    await expect(buildBranchAnswer(r, seed())).rejects.toThrow();
  });
});
