import { readFileSync } from "node:fs";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { ed25519, x25519 } from "@noble/curves/ed25519";
import { base64urlnopad } from "@scure/base";
import {
  readSeedsRequest,
  SEEDS_CLOCK_TOLERANCE_MS,
  seedsRequestBytes,
  SEEDS_POCKET_PATHS,
  SEEDS_REQUEST_KEYS,
  SEEDS_VAULT_REQUEST,
  verifySignedSeedsRequest,
  type SignedSeedsRequest,
} from "./seeds-request";

// Public deterministic test fixtures only, never a production signing credential.
const TEST_SECRET = new Uint8Array(32).fill(42);
const TEST_TRUST = { "test-only": base64urlnopad.encode(ed25519.getPublicKey(TEST_SECRET)) };
const NOW = Date.parse("2026-11-22T15:06:00.000Z");

function request(overrides: Partial<Omit<SignedSeedsRequest, "request_sig">> = {}) {
  const r: Omit<SignedSeedsRequest, "request_sig"> = {
    type: SEEDS_VAULT_REQUEST,
    v: 2,
    signing_key_id: "test-only",
    domain: "seeds.honest.money",
    key_host: "key.seeds.honest.money",
    challenge_id: "a".repeat(32),
    challenge: "c".repeat(48),
    recipient_pubkey: base64urlnopad.encode(x25519.getPublicKey(new Uint8Array(32).fill(7))),
    pocket: 1106,
    issued_at: new Date(NOW).toISOString(),
    expires_at: new Date(NOW + 600_000).toISOString(),
    paths: [...SEEDS_POCKET_PATHS],
    ...overrides,
  };
  return {
    ...r,
    request_sig: base64urlnopad.encode(ed25519.sign(seedsRequestBytes(r), TEST_SECRET)),
  };
}

/** SEEDS' own harmless example, signed with the production key (docs/vault-request-signer.md in SEEDS). */
const PRODUCTION_EXAMPLE = readFileSync(
  new URL("./fixtures/seeds-production-example-request.json", import.meta.url),
  "utf8",
);
const EXAMPLE_CLOCK = Date.parse("2026-01-01T00:05:00.000Z");
/** The same example signed with SEEDS' retired key; must no longer open. */
const RETIRED_EXAMPLE = readFileSync(
  new URL("./fixtures/seeds-retired-key-example-request.json", import.meta.url),
  "utf8",
);

describe("SEEDS' pinned production signing key", () => {
  it("pins exactly one reviewed key id and value", () => {
    expect(SEEDS_REQUEST_KEYS).toEqual({
      "seeds-vault-kms-2026-11": "6_06ZOHGeDeGX7O1ToRTAmdiGs0_AOSSX70VbTd9IjA",
    });
    expect(Object.isFrozen(SEEDS_REQUEST_KEYS)).toBe(true);
  });

  it("matches the fingerprint the owner confirmed on his phone", () => {
    const key = base64urlnopad.decode(SEEDS_REQUEST_KEYS["seeds-vault-kms-2026-11"]!);
    expect(key).toHaveLength(32);
    expect(bytesToHex(sha256(key))).toBe(
      "0556577f852b0cf2a05a1c75ecbf806e6657ce193393d9e800137b6537c86d4d",
    );
  });

  it("verifies SEEDS' production-signed example at its own clock", () => {
    const r = verifySignedSeedsRequest(
      JSON.parse(PRODUCTION_EXAMPLE),
      SEEDS_REQUEST_KEYS,
      EXAMPLE_CLOCK,
    );
    expect(r.signing_key_id).toBe("seeds-vault-kms-2026-11");
    expect(r.pocket).toBe(1106);
    expect(r.paths).toEqual([...SEEDS_POCKET_PATHS]);
  });

  it("refuses that example with the real clock, because it expired", () => {
    expect(() => readSeedsRequest(PRODUCTION_EXAMPLE)).toThrow(/expired/);
  });

  it("refuses the example if any signed field is changed", () => {
    const x = JSON.parse(PRODUCTION_EXAMPLE) as Record<string, unknown>;
    for (const [field, value] of Object.entries({
      challenge: "0".repeat(47) + "2",
      recipient_pubkey: base64urlnopad.encode(x25519.getPublicKey(new Uint8Array(32).fill(7))),
      expires_at: "2026-01-01T00:09:00.000Z",
    }))
      expect(() =>
        verifySignedSeedsRequest({ ...x, [field]: value }, SEEDS_REQUEST_KEYS, EXAMPLE_CLOCK),
      ).toThrow();
  });

  it("the production reader refuses a request signed by any other key", () => {
    expect(() => readSeedsRequest(JSON.stringify(request()))).toThrow(/doesn't trust/);
  });

  it("the retired key no longer opens anything, even its own signed example", () => {
    expect(SEEDS_REQUEST_KEYS).not.toHaveProperty("seeds-vault-2026-11");
    expect(Object.values(SEEDS_REQUEST_KEYS)).not.toContain(
      "KuDdTWX-bDwxkSff2lULKVwvUS_Dfa0tZLy_iWefuxc",
    );
    expect(() =>
      verifySignedSeedsRequest(JSON.parse(RETIRED_EXAMPLE), SEEDS_REQUEST_KEYS, EXAMPLE_CLOCK),
    ).toThrow(/doesn't trust/);
  });

  it("the retired example relabelled with the new id fails the signature check", () => {
    const x = JSON.parse(RETIRED_EXAMPLE) as Record<string, unknown>;
    expect(() =>
      verifySignedSeedsRequest(
        { ...x, signing_key_id: "seeds-vault-kms-2026-11" },
        SEEDS_REQUEST_KEYS,
        EXAMPLE_CLOCK,
      ),
    ).toThrow(/couldn't be verified/);
  });

  it("a different key cannot reuse the pinned id", () => {
    const r = request({ signing_key_id: "seeds-vault-kms-2026-11" });
    expect(() => verifySignedSeedsRequest(r, SEEDS_REQUEST_KEYS, NOW)).toThrow();
  });
});

describe("Seeds signed-request protection", () => {
  it("refuses unsigned requests with otherwise valid live hosts and pocket 1106", () => {
    const { request_sig, ...unsigned } = request();
    expect(() => verifySignedSeedsRequest(unsigned, TEST_TRUST, NOW)).toThrow();
  });
  it("accepts a valid pinned signature for pocket 1106 and exactly 16 paths", () => {
    const result = verifySignedSeedsRequest(request(), TEST_TRUST, NOW);
    expect(result.pocket).toBe(1106);
    expect(result.paths).toHaveLength(16);
    expect(result.paths).toEqual([
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
  });
  it("signs exactly the Seeds Key v2 fixed-order tuple", () => {
    const r = request();
    const expected = JSON.stringify([
      "HME Seeds Vault request",
      "hm-seeds-key-vault-request",
      2,
      "test-only",
      "seeds.honest.money",
      "key.seeds.honest.money",
      "a".repeat(32),
      "c".repeat(48),
      r.recipient_pubkey,
      1106,
      "2026-11-22T15:06:00.000Z",
      "2026-11-22T15:16:00.000Z",
      r.paths,
    ]);
    expect(new TextDecoder().decode(seedsRequestBytes(r))).toBe(expected);
  });
  const substitutions: Record<string, unknown> = {
    type: "other",
    v: 1,
    signing_key_id: "unknown",
    domain: "evil.example",
    key_host: "evil.example",
    challenge_id: "b".repeat(32),
    challenge: "d".repeat(48),
    recipient_pubkey: base64urlnopad.encode(x25519.getPublicKey(new Uint8Array(32).fill(8))),
    pocket: 1107,
    issued_at: new Date(NOW - 1).toISOString(),
    expires_at: new Date(NOW + 599_999).toISOString(),
    paths: [...SEEDS_POCKET_PATHS].reverse(),
    request_sig: base64urlnopad.encode(new Uint8Array(64).fill(1)),
  };
  for (const [field, value] of Object.entries(substitutions)) {
    it(`rejects substitution of ${field}`, () => {
      expect(() =>
        verifySignedSeedsRequest({ ...request(), [field]: value }, TEST_TRUST, NOW),
      ).toThrow();
    });
  }
  for (const pocket of [0, 1107, 2105]) {
    it(`rejects pocket ${pocket} even with a valid trusted signature`, () => {
      expect(() => verifySignedSeedsRequest(request({ pocket }), TEST_TRUST, NOW)).toThrow();
    });
  }
  it("rejects signed savings paths even with all 16 entries", () => {
    const paths = [...SEEDS_POCKET_PATHS];
    paths[0] = "m/44'/696969'/0'";
    expect(() => verifySignedSeedsRequest(request({ paths }), TEST_TRUST, NOW)).toThrow();
  });
  it("rejects a forged signature despite genuine-looking names and match challenge", () => {
    const r = request();
    const request_sig = base64urlnopad.encode(
      ed25519.sign(seedsRequestBytes(r), new Uint8Array(32).fill(99)),
    );
    expect(() => verifySignedSeedsRequest({ ...r, request_sig }, TEST_TRUST, NOW)).toThrow();
  });
  it("does not trust a signing key supplied inside the QR", () => {
    expect(() =>
      readSeedsRequest(JSON.stringify({ ...request(), signing_pubkey: TEST_TRUST["test-only"] })),
    ).toThrow(/doesn't trust/);
  });
  it("does not accept inherited trust entries", () => {
    const trust = Object.create(TEST_TRUST) as Record<string, string>;
    expect(() => verifySignedSeedsRequest(request(), trust, NOW)).toThrow(/doesn't trust/);
  });
  it("returns an immutable copy with no attacker-controlled app name or key", () => {
    const paths = [...SEEDS_POCKET_PATHS];
    const original = request({ paths });
    const result = verifySignedSeedsRequest(
      { ...original, app_name: "Trusted Bank", signing_pubkey: "fake" },
      TEST_TRUST,
      NOW,
    );
    paths[0] = "m/44'/696969'/0'";
    expect(result.paths[0]).toBe("m/44'/696969'/1106'");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.paths)).toBe(true);
    expect(result).not.toHaveProperty("app_name");
    expect(result).not.toHaveProperty("signing_pubkey");
  });
  it("tolerates exactly five minutes of clock difference, as the owner chose", () => {
    expect(SEEDS_CLOCK_TOLERANCE_MS).toBe(300_000);
  });
  it("phone clock up to 5 minutes fast: accepted until expiry + 5 min, refused at that instant", () => {
    const r = request();
    expect(verifySignedSeedsRequest(r, TEST_TRUST, NOW + 600_000 + 299_999).pocket).toBe(1106);
    expect(() => verifySignedSeedsRequest(r, TEST_TRUST, NOW + 600_000 + 300_000)).toThrow(
      /expired/,
    );
  });
  it("phone clock up to 5 minutes slow: accepted, but 5 minutes plus one millisecond is refused", () => {
    const r = request({
      issued_at: new Date(NOW + 300_000).toISOString(),
      expires_at: new Date(NOW + 360_000).toISOString(),
    });
    expect(verifySignedSeedsRequest(r, TEST_TRUST, NOW).pocket).toBe(1106);
    expect(() => verifySignedSeedsRequest(r, TEST_TRUST, NOW - 1)).toThrow(/clock/);
  });
  it("a clock that is hours off is still refused", () => {
    const r = request();
    expect(() => verifySignedSeedsRequest(r, TEST_TRUST, NOW - 3_600_000)).toThrow(/clock/);
    expect(() => verifySignedSeedsRequest(r, TEST_TRUST, NOW + 3_600_000)).toThrow(/expired/);
  });
  it("rejects a lifetime exceeding ten minutes", () => {
    expect(() =>
      verifySignedSeedsRequest(
        request({ expires_at: new Date(NOW + 600_001).toISOString() }),
        TEST_TRUST,
        NOW,
      ),
    ).toThrow();
  });
  it("rejects invalid and noncanonical dates", () => {
    for (const issued_at of ["not-a-date", "2026-11-22T15:06:00Z"])
      expect(() => verifySignedSeedsRequest(request({ issued_at }), TEST_TRUST, NOW)).toThrow();
  });
  it("rejects malformed and low-order recipient keys before delegation", () => {
    for (const recipient_pubkey of [
      "bad",
      base64urlnopad.encode(new Uint8Array(32)),
      base64urlnopad.encode(Uint8Array.from([1, ...new Uint8Array(31)])),
    ])
      expect(() =>
        verifySignedSeedsRequest(request({ recipient_pubkey }), TEST_TRUST, NOW),
      ).toThrow();
  });
  it("rejects padded recipient key encodings", () => {
    expect(() =>
      verifySignedSeedsRequest(
        request({ recipient_pubkey: `${request().recipient_pubkey}=` }),
        TEST_TRUST,
        NOW,
      ),
    ).toThrow();
  });
  it("caps the incoming request at 8192 characters", () => {
    expect(() => readSeedsRequest(" ".repeat(8193))).toThrow(/verified/);
  });
  it("rejects invalid JSON and unsupported top-level shapes", () => {
    for (const text of ["{", "null", "[]", "1"])
      expect(() => readSeedsRequest(text)).toThrow(/verified/);
  });
  it("rejects an invalid verifier clock", () => {
    expect(() => verifySignedSeedsRequest(request(), TEST_TRUST, Number.NaN)).toThrow();
  });
});
