/**
 * Cross-project derivation vectors. Every value here is produced by Seeds Key's
 * own copy of these modules (Key `src/lib/seeds-key/vectors.test.ts`), so a pass
 * proves Vault derives the identical pocket keys and identity from the same words.
 * Copying these modules is only safe while this file keeps passing.
 */
import { describe, expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { createBase58check, hex } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import {
  coinIdentityKey,
  seedPassphrase,
  signTxcMessage,
} from "@/lib/key-signin/seeds-key-reference";
import { receivingAddress } from "@/lib/vault/seeds";
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

describe("extra password (BIP39 passphrase) matches the standard and this Vault", () => {
  // Official BIP39 test vector: these words + "TREZOR" give this seed.
  const TREZOR_SEED =
    "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04";

  it("identity equals the address derived straight from the BIP39 vector seed", () => {
    const node = HDKey.fromMasterSeed(hex.decode(TREZOR_SEED)).derive("m/44'/696969'/0'/0/0");
    const independent = createBase58check(sha256).encode(
      Uint8Array.of(66, ...ripemd160(sha256(node.publicKey!))),
    );
    expect(independent).toBe("TwxEiJxUHv6Qx8tUzdk2XfXzv9q4yt7j8V");
    expect(signTxcMessage(coinIdentityKey(PHRASE, "TREZOR"), "x").address).toBe(independent);
  });

  it("identity is the same first TXC address Vault shows for that seed and password", async () => {
    const shown = await receivingAddress(PHRASE, "TREZOR", "TXC");
    expect(shown.path).toBe("m/44'/696969'/0'/0/0");
    expect(signTxcMessage(coinIdentityKey(PHRASE, "TREZOR"), "x").address).toBe(shown.address);
  });

  it("no password keeps the original identity and pocket", () => {
    expect(signTxcMessage(coinIdentityKey(PHRASE, ""), "x").address).toBe(
      "TZZCuca5ntPVCJL5ryTjh465Jvw5vHxsVd",
    );
    expect(pocketsFromMnemonic(PHRASE, { account: 1106, passphrase: seedPassphrase("") })).toEqual(
      pocketsFromMnemonic(PHRASE, { account: 1106 }),
    );
  });

  it("a password changes every one of the 16 pocket keys", () => {
    const plain = pocketsFromMnemonic(PHRASE, { account: 1106 });
    const extra = pocketsFromMnemonic(PHRASE, {
      account: 1106,
      passphrase: seedPassphrase("TREZOR"),
    });
    for (const coin of POCKET_COINS) expect(extra.xpubs[coin]).not.toBe(plain.xpubs[coin]);
  });

  it("composed and decomposed accents give the same wallet on every chain, Cardano included", () => {
    expect(seedPassphrase("caf\u00e9")).toBe(seedPassphrase("cafe\u0301"));
    const a = pocketsFromMnemonic(PHRASE, {
      account: 1106,
      passphrase: seedPassphrase("caf\u00e9"),
    });
    const b = pocketsFromMnemonic(PHRASE, {
      account: 1106,
      passphrase: seedPassphrase("cafe\u0301"),
    });
    expect(b.xpubs).toEqual(a.xpubs);
    expect(signTxcMessage(coinIdentityKey(PHRASE, "cafe\u0301"), "x").address).toBe(
      signTxcMessage(coinIdentityKey(PHRASE, "caf\u00e9"), "x").address,
    );
  });

  it("refuses an extra password that is not text", () => {
    expect(() => seedPassphrase(42)).toThrow();
  });
});
