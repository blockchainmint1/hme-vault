/**
 * Fingerprints of the modules copied from the Seeds Key project. Each value was
 * recorded after checking the file against Seeds Key: coins/derive/encode and
 * ed25519-chains at f5063fca (Prettier plus guarded nullable reads only), the
 * unchanged pockets modules and
 * rules.ts at commit 80fd70a2, and seeds-key-reference.ts (with Key's optional
 * extra-password support) at commit 0af0ba5b, and vault-label.ts byte-for-byte at
 * commit 6d9e1e46. After our Prettier formatting the
 * code is identical, except one line in seeds-key-reference.ts adapted from
 * noble 2.x to Vault's noble 1.9.7 (vectors.test.ts proves the signature bytes
 * are the same).
 *
 * If this test fails, a copied file changed. Re-copy from Seeds Key, re-run the
 * cross-project vectors, get the change reviewed, and only then update the value.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PINNED: Readonly<Record<string, string>> = {
  "./cardano.ts": "052a690234d4cb0f1c11d4dab2395a98687bf267a3fa6355cbd009989c971d35",
  "./coins.ts": "446b38b14d22a754308f97f1df5e05e7fb22f4e0e46e7d6cf2b8ecbcfe2e0edb",
  "./derive.ts": "9e4783564487df389301311c3f2bdc03b89b782234c6bbd9fa84451c5897eac5",
  "./encode.ts": "91ce1dd2a2bd984a9da956a29c752831814238eb13b440f14ac651a97e696d08",
  "./ed25519-chains.ts": "c54cb4626cbe5ad15b4c24a2070a5bba1523d1970d0a2eefd7a756fded56631c",
  "./monero.ts": "af83d061df698fce1d5367da61685aac8d04efb533392d84c58935fffd8e20fc",
  "./slip10.ts": "862526390913aed722c155fdd97838b551da0f1cd52774f5a6309001fe89d344",
  "../key-signin/rules.ts": "147d423f9e87ecd0133f2ed27198d01decaf108ef41240edb6bdaa86c4df2280",
  "../key-signin/seeds-key-reference.ts":
    "47d7a937a5af0eeb1ed42cbbeb249241a154cab88f3f6ca17eb4492e5d061f58",
  "../key-signin/vault-label.ts":
    "b3871497bf90198a6c2d065c19b02934ec9c8747d6300596b220b3f5c4825fb5",
};

describe("files copied from Seeds Key are unchanged", () => {
  for (const [file, expected] of Object.entries(PINNED)) {
    it(file, () => {
      const bytes = readFileSync(new URL(file, import.meta.url));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected);
    });
  }
});
