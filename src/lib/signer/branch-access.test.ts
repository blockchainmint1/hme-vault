/**
 * Branch-access gating. Every request here is signed by a public, deterministic
 * test key that is never installed in production trust; the app path is checked
 * separately to prove only SEEDS' pinned production key opens it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { base64, base64urlnopad, createBase58check } from "@scure/base";
import { readVaultLabel, vaultLabelMessage } from "@/lib/key-signin/vault-label";
import { accountPath, POCKET_COINS } from "@/lib/pockets/coins";
import {
  branchAnswerSeedId,
  BRANCH_ANSWER_TYPE,
  BRANCH_PROFILES,
  buildBranchAnswer,
  handOverPocket,
  HandoverGuard,
  readBranchRequest,
  unsupportedBranchPaths,
} from "@/lib/signer/branch-access";
import {
  readSeedsRequest,
  SEEDS_CLOCK_TOLERANCE_MS,
  SEEDS_POCKET_PATHS,
  SEEDS_REQUEST_KEYS,
  SEEDS_VAULT_REQUEST,
  seedsRequestBytes,
} from "@/lib/signer/seeds-request";
import type { SeedEntry } from "@/lib/vault/seeds";

const PRODUCTION_EXAMPLE = readFileSync(
  new URL("./fixtures/seeds-production-example-request.json", import.meta.url),
  "utf8",
);

const TEST_SIGNING_SECRET = new Uint8Array(32).fill(42);
const TEST_TRUST = {
  "test-only": base64urlnopad.encode(ed25519.getPublicKey(TEST_SIGNING_SECRET)),
};
const RECIPIENT_SECRET = new Uint8Array(32).fill(7);
const RECIPIENT_PUB = base64urlnopad.encode(x25519.getPublicKey(RECIPIENT_SECRET));

/** TXC identity for WORDS + extra password "TREZOR", from the official BIP39 vector seed. */
const TREZOR_IDENTITY = "TwxEiJxUHv6Qx8tUzdk2XfXzv9q4yt7j8V";

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

describe("the app path trusts only SEEDS' pinned production key", () => {
  it("production trust is exactly the reviewed SEEDS key", () => {
    expect(Object.keys(SEEDS_REQUEST_KEYS)).toEqual(["seeds-vault-kms-2026-11"]);
  });

  it("a request signed by any other key is refused", () => {
    expect(() => readBranchRequest(signedRequest())).toThrow(/doesn't trust/);
  });

  it("SEEDS' production-signed example opens the review screen at its own clock", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.parse("2026-01-01T00:05:00.000Z"));
      const r = readBranchRequest(PRODUCTION_EXAMPLE);
      expect(r.service).toBe("Seeds Exchange");
      expect(r.pocket).toBe(1106);
      expect(r.paths).toEqual([...SEEDS_POCKET_PATHS]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("only the Seeds profile exists today", () => {
    expect(BRANCH_PROFILES.map((p) => p.id)).toEqual(["seeds"]);
  });

  it("every profile's production trust holds only reviewed key ids", () => {
    // Pinning a key means updating this table in the same reviewed change.
    const REVIEWED: Record<string, string[]> = { seeds: ["seeds-vault-kms-2026-11"] };
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
  it("refuses unless the seed's name is typed exactly", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    for (const typed of ["", "trading", "Trading ", " Trading", "Tradin"])
      await expect(buildBranchAnswer(r, seed(), typed)).rejects.toThrow(/seed name/i);
    await expect(buildBranchAnswer(r, seed(), "Trading")).resolves.toContain(
      "hm-seeds-key-vault-response",
    );
  });

  it("refuses a hands-off copy before deriving anything", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    await expect(buildBranchAnswer(r, seed({ handsOff: true }), "Trading")).rejects.toThrow(
      /hands-off/i,
    );
  });

  it("hands over the extra-password wallet, never the bare-words wallet or the password", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    const plain = JSON.parse(await buildBranchAnswer(r, seed(), "Trading")) as {
      body: { identity_address: string; xpubs: Record<string, string>; payload: string };
    };
    const answer = await buildBranchAnswer(r, seed({ passphrase: "TREZOR" }), "Trading");
    expect(answer).not.toContain("TREZOR");
    const extra = JSON.parse(answer) as typeof plain;
    // Same identity Vault itself shows for this seed and password (BIP39 vector seed).
    expect(extra.body.identity_address).toBe(TREZOR_IDENTITY);
    expect(extra.body.identity_address).not.toBe(plain.body.identity_address);
    for (const coin of POCKET_COINS)
      expect(extra.body.xpubs[coin]).not.toBe(plain.body.xpubs[coin]);
    const xprvs = await openPayload(extra.body.payload);
    expect(Object.keys(xprvs).sort()).toEqual([...POCKET_COINS].sort());
    expect(JSON.stringify(xprvs)).not.toContain("TREZOR");
  });

  it("gives the same pocket however the phone's keyboard composed the extra password", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    const xpubs = async (passphrase: string) =>
      (
        JSON.parse(await buildBranchAnswer(r, seed({ passphrase }), "Trading")) as {
          body: { identity_address: string; xpubs: Record<string, string> };
        }
      ).body;
    const composed = await xpubs("caf\u00e9");
    const decomposed = await xpubs("cafe\u0301");
    expect(decomposed.identity_address).toBe(composed.identity_address);
    expect(decomposed.xpubs).toEqual(composed.xpubs);
  });

  it("refuses an approved request whose scope was altered after reading", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    const widened = { ...r, paths: [...r.paths, "m/44'/0'/1106'"] };
    await expect(buildBranchAnswer(widened, seed(), "Trading")).rejects.toThrow();
  });

  it("carries only Seeds' envelope fields and never the recovery words", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    const answer = await buildBranchAnswer(r, seed(), "Trading");
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
      [
        "account",
        "identity_address",
        "kind",
        "paths",
        "payload",
        "token",
        "vault_fingerprint",
        "vault_label_signature",
        "xpubs",
      ].sort(),
    );
    expect(body.account).toBe(1106);
    expect(body.kind).toBe("coin");
    expect(body.paths).toEqual(SEEDS_POCKET_PATHS);
  });

  it("seals exactly the 16 pocket keys and nothing else", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    const answer = await buildBranchAnswer(r, seed(), "Trading");
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
    const answer = await buildBranchAnswer(r, seed(), "Trading");
    const parsed = JSON.parse(answer) as { body: { payload: string; identity_address: string } };
    // Opens only with the one-time key the request named, and names the identity
    // the owner was shown.
    const xprvs = await openPayload(parsed.body.payload);
    expect(Object.keys(xprvs).length).toBe(16);
    expect(parsed.body.identity_address).toBe("TZZCuca5ntPVCJL5ryTjh465Jvw5vHxsVd");
  });

  it("the screen's deadline is the stated expiry plus the clock tolerance", () => {
    const now = Date.now();
    const expires = now + 600_000;
    const r = readBranchRequest(
      signedRequest({
        issued_at: new Date(now).toISOString(),
        expires_at: new Date(expires).toISOString(),
      }),
      TEST_TRUST,
    );
    expect(r.expiresAt).toBe(expires + 300_000);
  });

  it("refuses to answer a request that lapsed while the owner was deciding", async () => {
    // Already past its stated expiry, 200 ms before the clock tolerance runs out.
    const expires = Date.now() - SEEDS_CLOCK_TOLERANCE_MS + 200;
    const r = readBranchRequest(
      signedRequest({
        issued_at: new Date(expires - 500_000).toISOString(),
        expires_at: new Date(expires).toISOString(),
      }),
      TEST_TRUST,
    );
    await new Promise((res) => setTimeout(res, 400));
    await expect(buildBranchAnswer(r, seed(), "Trading")).rejects.toThrow();
  });
});

describe("newer Seeds requests never widen the approved export", () => {
  const extraPaths = ["m/44'/148'/1106'", "m/44'/607'/1106'", "m/44'/784'/1106'/0'/0'"];

  function expandedRequest() {
    return readBranchRequest(
      signedRequest({ paths: [...SEEDS_POCKET_PATHS, ...extraPaths].reverse() }),
      TEST_TRUST,
    );
  }

  it("keeps all 19 requested paths signed while approving only the pinned 16 paths", () => {
    const r = expandedRequest();
    expect(r.verified.paths).toEqual([...SEEDS_POCKET_PATHS, ...extraPaths].reverse());
    expect(r.paths).toEqual(SEEDS_POCKET_PATHS);
    expect(r.paths).toHaveLength(16);
    expect(unsupportedBranchPaths(r)).toEqual([...extraPaths].reverse());
    expect(Object.isFrozen(r)).toBe(true);
  });

  it("ordinary 16-key requests have no unsupported paths", () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    expect(unsupportedBranchPaths(r)).toEqual([]);
  });

  it("an expanded request seals the identical existing 16 keys including EVM, ADA and XMR", async () => {
    type Answer = {
      message: string;
      signature: string;
      body: Record<string, unknown> & {
        paths: string[];
        payload: string;
        identity_address: string;
        vault_fingerprint: string;
        xpubs: Record<string, string>;
      };
    };
    const ownerSeed = seed({ passphrase: "TREZOR" });
    const original = readBranchRequest(signedRequest(), TEST_TRUST);
    const oldAnswer = JSON.parse(await buildBranchAnswer(original, ownerSeed, "Trading")) as Answer;
    const text = await buildBranchAnswer(expandedRequest(), ownerSeed, "Trading");
    const answer = JSON.parse(text) as Answer;
    const secretKeys = await openPayload(answer.body.payload);
    expect(secretKeys).toEqual(await openPayload(oldAnswer.body.payload));
    expect(Object.keys(secretKeys).sort()).toEqual([...POCKET_COINS].sort());
    expect(Object.keys(secretKeys)).toHaveLength(16);
    expect(answer.body.xpubs).toEqual(oldAnswer.body.xpubs);
    for (const coin of ["EVM", "ADA", "XMR"]) {
      expect(secretKeys[coin]?.length).toBeGreaterThan(20);
      expect(answer.body.xpubs[coin]?.length).toBeGreaterThan(20);
    }
    for (const coin of ["XLM", "TON", "SUI"]) {
      expect(secretKeys).not.toHaveProperty(coin);
      expect(answer.body.xpubs).not.toHaveProperty(coin);
    }
    expect(answer.body.paths).toEqual(SEEDS_POCKET_PATHS);
    expect(answer.body.identity_address).toBe(TREZOR_IDENTITY);
    expect(answer.body.vault_fingerprint).toBe("b4e3f5ed");
    expect(txcSignedBy(answer.body.identity_address, answer.message, answer.signature)).toBe(true);
    expect(
      readVaultLabel(answer.body, answer.message, answer.body.identity_address, txcSignedBy),
    ).toBeDefined();
    expect(text).not.toContain("TREZOR");
    expect(text).not.toContain("abandon");
  });

  it("refuses to add an authenticated but unsupported path to the approved export", async () => {
    const r = expandedRequest();
    const widened = { ...r, paths: [...r.paths, "m/44'/148'/1106'"] };
    await expect(buildBranchAnswer(widened, seed(), "Trading")).rejects.toThrow();
  });

  it("rechecks the complete extended signature immediately before derivation", async () => {
    const r = expandedRequest();
    const tampered = {
      ...r,
      verified: { ...r.verified, paths: [...SEEDS_POCKET_PATHS, "m/44'/149'/1106'"] },
    };
    await expect(buildBranchAnswer(tampered, seed(), "Trading")).rejects.toThrow();
  });

  it("refuses a mismatched approved pocket even if the request signature remains valid", async () => {
    const r = expandedRequest();
    await expect(buildBranchAnswer({ ...r, pocket: 1107 }, seed(), "Trading")).rejects.toThrow();
  });

  it("expanded requests still require exact seed-name confirmation", async () => {
    await expect(buildBranchAnswer(expandedRequest(), seed(), "trading")).rejects.toThrow(
      /seed name/i,
    );
  });

  it("expanded requests never export hands-off seeds", async () => {
    await expect(
      buildBranchAnswer(expandedRequest(), seed({ handsOff: true }), "Trading"),
    ).rejects.toThrow(/hands-off/i);
  });
});

/** A promise the test resolves by hand, to pause a step mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("cancelling a hand-over never shows or records a late answer", () => {
  function setup() {
    const guard = new HandoverGuard();
    const request = readBranchRequest(signedRequest(), TEST_TRUST);
    const ticket = guard.begin(request, "s1");
    const built = deferred<string>();
    const saved = deferred<void>();
    let builds = 0;
    let records = 0;
    const run = (over: Partial<Parameters<typeof handOverPocket>[0]> = {}) =>
      handOverPocket({
        guard,
        ticket,
        seed: seed(),
        typedName: "Trading",
        build: () => {
          builds++;
          return built.promise;
        },
        record: () => {
          records++;
          return saved.promise;
        },
        ...over,
      });
    return { guard, request, ticket, built, saved, run, counts: () => ({ builds, records }) };
  }

  it("shows the answer when nothing interrupts it", async () => {
    const t = setup();
    const result = t.run();
    t.built.resolve("ANSWER");
    t.saved.resolve();
    await expect(result).resolves.toBe("ANSWER");
    expect(t.counts()).toEqual({ builds: 1, records: 1 });
  });

  it("cancel while keys are being prepared: no answer and no record", async () => {
    const t = setup();
    const result = t.run();
    t.guard.cancel();
    t.built.resolve("ANSWER");
    await expect(result).resolves.toBeNull();
    expect(t.counts().records).toBe(0);
  });

  it("cancel while the record is being saved: no answer", async () => {
    const t = setup();
    const result = t.run();
    t.built.resolve("ANSWER");
    for (let i = 0; i < 50 && t.counts().records === 0; i++) await Promise.resolve();
    expect(t.counts().records).toBe(1);
    t.guard.cancel();
    t.saved.resolve();
    await expect(result).resolves.toBeNull();
  });

  it("choosing another seed or starting again makes the earlier approval stale", async () => {
    const t = setup();
    const result = t.run();
    t.guard.begin(t.request, "s2");
    t.built.resolve("ANSWER");
    await expect(result).resolves.toBeNull();
    expect(t.counts().records).toBe(0);
  });

  it("an already-cancelled approval derives nothing", async () => {
    const t = setup();
    t.guard.cancel();
    await expect(t.run()).resolves.toBeNull();
    expect(t.counts()).toEqual({ builds: 0, records: 0 });
  });

  it("refuses when the seed handed in is not the one approved", async () => {
    const t = setup();
    await expect(t.run({ seed: seed({ id: "other" }) })).rejects.toThrow(/seed changed/i);
    expect(t.counts().builds).toBe(0);
  });

  it("a request that lapses while the record saves is never shown", async () => {
    const expires = Date.now() - SEEDS_CLOCK_TOLERANCE_MS + 300;
    const guard = new HandoverGuard();
    const request = readBranchRequest(
      signedRequest({
        issued_at: new Date(expires - 500_000).toISOString(),
        expires_at: new Date(expires).toISOString(),
      }),
      TEST_TRUST,
    );
    const result = handOverPocket({
      guard,
      ticket: guard.begin(request, "s1"),
      seed: seed(),
      typedName: "Trading",
      build: async () => "ANSWER",
      record: () => new Promise((res) => setTimeout(res, 500)),
    });
    await expect(result).rejects.toThrow(/expired/i);
  });
});

/** What Seeds Key and SEEDS do with a TXC signature: recover the signer's address. */
function txcSignedBy(address: string, message: string, signature: string): boolean {
  try {
    const varint = (n: number) =>
      n < 0xfd ? Uint8Array.of(n) : Uint8Array.of(0xfd, n & 0xff, n >> 8);
    const p = new TextEncoder().encode("Bitcoin Signed Message:\n");
    const m = new TextEncoder().encode(message);
    const hash = sha256(sha256(concat(varint(p.length), p, varint(m.length), m)));
    const raw = base64.decode(signature);
    if (raw.length !== 65 || raw[0]! < 31 || raw[0]! > 34) return false;
    const point = secp256k1.Signature.fromBytes(
      concat(Uint8Array.of(raw[0]! - 31), raw.slice(1)),
      "recovered",
    ).recoverPublicKey(hash);
    const b58c = createBase58check(sha256);
    return (
      b58c.encode(concat(Uint8Array.of(66), ripemd160(sha256(point.toBytes(true))))) === address
    );
  } catch {
    return false;
  }
}

type LabeledAnswer = {
  message: string;
  signature: string;
  body: Record<string, unknown> & { identity_address: string; vault_fingerprint: string };
};

async function labeled(over: Partial<SeedEntry> = {}): Promise<LabeledAnswer> {
  const r = readBranchRequest(signedRequest(), TEST_TRUST);
  return JSON.parse(
    await buildBranchAnswer(r, seed(over), over.name ?? "Trading"),
  ) as LabeledAnswer;
}

describe("the answer names the seed by the ID Vault shows beside it", () => {
  it("carries the official BIP39 vector seed's ID, 73c5da0a, signed by the same identity", async () => {
    const a = await labeled();
    expect(a.body.vault_fingerprint).toBe("73c5da0a");
    // Exactly the check Seeds Key runs before forwarding to SEEDS.
    expect(readVaultLabel(a.body, a.message, a.body.identity_address, txcSignedBy)).toEqual({
      vault_fingerprint: "73c5da0a",
      vault_label_signature: a.body["vault_label_signature"],
    });
    expect(txcSignedBy(a.body.identity_address, a.message, a.signature)).toBe(true);
  });

  it("recomputes the ID from the words, ignoring a wrong stored one", async () => {
    const a = await labeled({ fingerprint: "deadbeef" });
    expect(a.body.vault_fingerprint).toBe("73c5da0a");
  });

  it("keeps a leading zero so the ID is always eight characters", async () => {
    const words = "baby mass dust captain baby mass dust captain baby mass dust casino";
    const a = await labeled({ words });
    expect(a.body.vault_fingerprint).toBe("0be174ee");
    expect(readVaultLabel(a.body, a.message, a.body.identity_address, txcSignedBy)).toBeDefined();
  });

  it("uses the extra-password wallet's ID, never the bare words' ID or the password", async () => {
    const a = await labeled({ passphrase: "TREZOR" });
    expect(a.body.vault_fingerprint).toBe("b4e3f5ed");
    expect(a.body.identity_address).toBe(TREZOR_IDENTITY);
    expect(JSON.stringify(a)).not.toContain("TREZOR");
    expect(readVaultLabel(a.body, a.message, TREZOR_IDENTITY, txcSignedBy)).toBeDefined();
  });

  it("gives the same ID however the keyboard composed the extra password", async () => {
    expect((await labeled({ passphrase: "caf\u00e9" })).body.vault_fingerprint).toBe("75902abe");
    expect((await labeled({ passphrase: "cafe\u0301" })).body.vault_fingerprint).toBe("75902abe");
  });

  it("a changed ID or a label lifted from another hand-over fails verification", async () => {
    const a = await labeled();
    const changed = { ...a.body, vault_fingerprint: "73c5da0b" };
    expect(() =>
      readVaultLabel(changed, a.message, a.body.identity_address, txcSignedBy),
    ).toThrow();
    const b = await labeled();
    expect(b.message).not.toBe(a.message);
    const lifted = { ...b.body, vault_label_signature: a.body["vault_label_signature"] };
    expect(() => readVaultLabel(lifted, b.message, b.body.identity_address, txcSignedBy)).toThrow();
    expect(vaultLabelMessage(a.message, "73c5da0a")).toBe(
      JSON.stringify(["HME Vault seed label", 1, a.message, "73c5da0a"]),
    );
  });

  it("never discloses the seed's name or recovery words", async () => {
    const text = JSON.stringify(await labeled({ name: "My Secret Savings Name" }));
    expect(text).not.toContain("Secret Savings");
    expect(text).not.toContain("abandon");
  });

  it("the screen reads back exactly the ID the answer carries", async () => {
    const r = readBranchRequest(signedRequest(), TEST_TRUST);
    const answer = await buildBranchAnswer(r, seed(), "Trading");
    expect(branchAnswerSeedId(answer)).toBe("73c5da0a");
    expect(branchAnswerSeedId("{}")).toBeNull();
    expect(branchAnswerSeedId("not json")).toBeNull();
  });
});
