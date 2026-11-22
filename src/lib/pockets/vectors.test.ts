/**
 * Cross-project derivation vectors. Every value here is produced by Seeds Key's
 * own copy of these modules (Key `src/lib/seeds-key/vectors.test.ts`), so a pass
 * proves Vault derives the identical pocket keys and identity from the same words.
 * Copying these modules is only safe while this file keeps passing.
 */
import { describe, expect, it } from "vitest";
import { coinIdentityKey, signTxcMessage } from "@/lib/key-signin/seeds-key-reference";
import { pairingCode } from "@/lib/key-signin/rules";
import { pocketsFromMnemonic } from "@/lib/pockets/derive";
import { POCKET_COINS } from "@/lib/pockets/coins";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("pocket derivation matches Seeds Key exactly", () => {
  it("coin identity address is the shared TXC sign-in identity", () => {
    expect(signTxcMessage(coinIdentityKey(PHRASE), "x").address).toBe(
      "TZZCuca5ntPVCJL5ryTjh465Jvw5vHxsVd",
    );
  });

  it("pocket 1106 covers all 16 chains with Key's known addresses", () => {
    const bundle = pocketsFromMnemonic(PHRASE, { account: 1106 });
    expect(Object.keys(bundle.xpubs).sort()).toEqual([...POCKET_COINS].sort());
    expect(bundle.paths).toEqual([
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
    const all = JSON.stringify(bundle.addresses);
    for (const v of [
      "Tg7WMV1iBgw6w44Z8ZzftiSKPu1yEStXvy",
      "KC4qNWsaf9soCJSmzNXjjWDcYwbedST1ht",
      "bc1q49kxnqa4uuh2ej0k6ys2vrd26nq338pwaf3r30",
      "LdydRYQJ1fQ4vwpqYn1tUzfLzdfQxZS6cP",
      "0x7231a79714ffD1b9f51216f79762fA38A40b4544",
      "DXTivYcF78Vznitg6f8JGXouZwsm3xioik1LGWj2H1jV",
    ])
      expect(all).toContain(v);
  });

  it("savings branch account 0 is never part of the pocket bundle", () => {
    const bundle = pocketsFromMnemonic(PHRASE, { account: 1106 });
    expect(bundle.account).toBe(1106);
    // The account segment (third level) must be 1106 everywhere; Solana's extra
    // hardened `/0'` child is a key index, not the savings account.
    expect(bundle.paths.some((p) => /^m\/\d+'\/\d+'\/0'/.test(p))).toBe(false);
    expect(bundle.paths.some((p) => !p.includes("1106"))).toBe(false);
  });

  it("pocket numbers outside 1106-2105 are refused", () => {
    expect(() => pocketsFromMnemonic(PHRASE, { account: 0 })).toThrow();
    expect(() => pocketsFromMnemonic(PHRASE, { account: 1105 })).toThrow();
    expect(() => pocketsFromMnemonic(PHRASE, { account: 2106 })).toThrow();
  });

  it("match code is the shared three-digit pairing code", () => {
    expect(pairingCode("c".repeat(48))).toBe("673");
  });
});
