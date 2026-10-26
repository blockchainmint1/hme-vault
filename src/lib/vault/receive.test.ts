import { describe, expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { payments } from "bitcoinjs-lib";
import { base58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import cashaddr from "cashaddrjs";
import { NETWORKS } from "../signer/networks";
import { pairingPayload, receivingAddress, RECEIVE_COINS, deriveKeys } from "./seeds";

const WORDS = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const paths = {
  TXC: "m/44'/696969'/0'/0/0", ISK: "m/44'/969696'/0'/0/0",
  BTC: "m/84'/0'/0'/0/0", LTC: "m/84'/2'/0'/0/0", DOGE: "m/44'/3'/0'/0/0",
  BCH: "m/44'/145'/0'/0/0", DASH: "m/44'/5'/0'/0/0",
  EVM: "m/44'/60'/0'/0/0", ZCU: "m/44'/60'/0'/0/0",
  TRON: "m/44'/195'/0'/0/0", SOL: "m/44'/501'/0'/0'",
};

describe("offline Receive", () => {
  for (const coin of RECEIVE_COINS) {
    it(`${coin} uses its first receiving path and changes with the seed passphrase`, async () => {
      const plain = await receivingAddress(WORDS, "", coin);
      const extra = await receivingAddress(WORDS, "Nectar dummy passphrase", coin);
      expect(plain.path).toBe(paths[coin]);
      expect(extra.path).toBe(paths[coin]);
      expect(extra.address).not.toBe(plain.address);
      expect(Object.keys(plain).sort()).toEqual(["address", "fingerprint", "format", "path"]);
      expect(plain.fingerprint).toBe("73c5da0a");
      expect(extra.fingerprint).not.toBe(plain.fingerprint);
    });
  }
  for (const passphrase of ["", "Nectar dummy passphrase"]) {
    for (const coin of ["TXC", "ISK", "BTC", "LTC", "DOGE", "DASH", "BCH"] as const) {
      it(`${coin} agrees with the public-only paired account (${passphrase || "empty"})`, async () => {
        const full = JSON.parse(await pairingPayload(WORDS, passphrase));
        const result = await receivingAddress(WORDS, passphrase, coin);
        const purpose = coin === "BTC" || coin === "LTC" ? "84" : "44";
        const child = HDKey.fromExtendedKey(full[coin.toLowerCase()][purpose]).derive("m/0/0");
        expect(child.privateKey).toBeNull();
        if (!child.publicKey) throw new Error("Missing public key");
        const network = coin === "DASH" ? { ...NETWORKS.BTC, pubKeyHash: 76 } : coin === "BCH" ? NETWORKS.BTC : NETWORKS[coin];
        const expected = purpose === "84" ? payments.p2wpkh({ pubkey: child.publicKey, network }).address : payments.p2pkh({ pubkey: child.publicKey, network }).address;
        if (coin === "BCH") {
          if (!expected) throw new Error("Missing legacy BCH address");
          const decoded = cashaddr.decode(result.address);
          expect(decoded.prefix).toBe("bitcoincash");
          expect(decoded.type).toBe("P2PKH");
          expect(decoded.hash).toEqual(base58check(sha256).decode(expected).slice(1));
        } else expect(result.address).toBe(expected);
      });
    }
    it(`EVM, ZCU, Solana and TXC match existing public outputs (${passphrase || "empty"})`, async () => {
      const full = JSON.parse(await pairingPayload(WORDS, passphrase));
      expect((await receivingAddress(WORDS, passphrase, "SOL")).address).toBe(full.sol.address);
      expect((await receivingAddress(WORDS, passphrase, "EVM")).address).toBe(full.evm.address);
      expect((await receivingAddress(WORDS, passphrase, "ZCU")).address).toBe(full.evm.address);
      expect((await receivingAddress(WORDS, passphrase, "TXC")).address).toBe((await deriveKeys(WORDS, passphrase)).txcAddress);
    });
  }
  it("matches established first-address vectors", async () => {
    expect((await receivingAddress(WORDS, "", "BTC")).address).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
    expect((await receivingAddress(WORDS, "", "TRON")).address).toBe("TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH");
    expect((await receivingAddress(WORDS, "", "SOL")).address).toBe("HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk");
    expect((await receivingAddress(WORDS, "", "EVM")).address).toBe("0x9858effd232b4033e47d90003d41ec34ecaeda94");
  });
  it("encodes the published CashAddr reference hash", () => {
    const hash = base58check(sha256).decode("1BpEi6DfDAUFd7GtittLSdBeYJvcoaVggu").slice(1);
    expect(cashaddr.encode("bitcoincash", "P2PKH", hash)).toBe("bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a");
  });
});