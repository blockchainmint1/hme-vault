/**
 * Fingerprints of the modules copied from the Seeds Key project. Each value was
 * recorded after checking the file against Seeds Key: the pockets modules and
 * rules.ts at commit 80fd70a2, and seeds-key-reference.ts (with Key's optional
 * extra-password support) at commit 0af0ba5b. After our Prettier formatting the
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
  "./coins.ts": "ebd31df92a864013c0f83fef177a364c5a5005e280eb37f5a70d161734f3ac51",
  "./derive.ts": "33818360d4e9122bd31b937db2fb775c3a25f746f56e5cc4f5225b1ff77fd108",
  "./encode.ts": "8fe02bff7660157f344b8d6d3625fc52e7f5ffcac82b63896d70355e90c66dc7",
  "./monero.ts": "af83d061df698fce1d5367da61685aac8d04efb533392d84c58935fffd8e20fc",
  "./slip10.ts": "862526390913aed722c155fdd97838b551da0f1cd52774f5a6309001fe89d344",
  "../key-signin/rules.ts": "147d423f9e87ecd0133f2ed27198d01decaf108ef41240edb6bdaa86c4df2280",
  "../key-signin/seeds-key-reference.ts":
    "47d7a937a5af0eeb1ed42cbbeb249241a154cab88f3f6ca17eb4492e5d061f58",
};

describe("files copied from Seeds Key are unchanged", () => {
  for (const [file, expected] of Object.entries(PINNED)) {
    it(file, () => {
      const bytes = readFileSync(new URL(file, import.meta.url));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected);
    });
  }
});
