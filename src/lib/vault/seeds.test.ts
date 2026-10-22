import { describe, expect, it } from "vitest";
import {
  deriveKeys,
  emptyVault,
  encryptVaultBackup,
  hasNewVaultEntries,
  lockoutMs,
  mergeSeeds,
  mergeVaultBackup,
  parsePayload,
  shouldAutoLock,
  TXC_ADDRESS_PATH,
  SOLANA_PATH,
  type SeedEntry,
} from "./seeds";
import { unlockText } from "./format";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { publicKeyToAddress } from "viem/accounts";
import { secp256k1 } from "@noble/curves/secp256k1";
import { pairingPayload, nectarPairingPayload } from "./seeds";
import { PART_SIZE, PartCollector, toParts } from "../signer/qr-parts";
import { payments, networks } from "bitcoinjs-lib";
import { base58, base58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

const SEED =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const e = (id: string, words: string, passphrase?: string): SeedEntry => ({
  id,
  name: id,
  words,
  passphrase,
  fingerprint: "x",
  createdAt: 0,
});

describe("vault rules", () => {
  it("requests a fresh backup when a seed is added", () => {
    expect(hasNewVaultEntries(emptyVault(), { ...emptyVault(), seeds: [e("new", SEED)] })).toBe(
      true,
    );
  });
  for (const type of ["totp", "note", "password", "file"] as const) {
    it(`requests a fresh backup when a ${type} entry is added`, () => {
      expect(
        hasNewVaultEntries(emptyVault(), {
          ...emptyVault(),
          secrets: [{ id: "new", name: "Dummy", type, content: "dummy", createdAt: 0 }],
        }),
      ).toBe(true);
    });
  }
  it("does not request a backup on unlock, rename, deletion or duplicate-only import", () => {
    const current = { ...emptyVault(), seeds: [e("old", SEED)] };
    expect(hasNewVaultEntries(current, current)).toBe(false);
    expect(
      hasNewVaultEntries(current, {
        ...current,
        seeds: [{ ...current.seeds[0], name: "Renamed" }],
      }),
    ).toBe(false);
    expect(hasNewVaultEntries(current, emptyVault())).toBe(false);
    expect(hasNewVaultEntries(current, mergeVaultBackup(current, current).payload)).toBe(false);
  });
  it("detects a new entry when another is removed in the same save", () => {
    expect(
      hasNewVaultEntries(
        { ...emptyVault(), seeds: [e("old", SEED)] },
        { ...emptyVault(), seeds: [e("new", SEED)] },
      ),
    ).toBe(true);
  });
  it("encrypts full backups using the existing Vault private-key credential, without a separate password", async () => {
    const key = "1234567890abcdef".repeat(4);
    const payload = {
      ...emptyVault(),
      seeds: [e("seed", SEED)],
      secrets: [
        { id: "note", name: "Note", type: "note" as const, content: "dummy note", createdAt: 0 },
        {
          id: "file",
          name: "Keystore",
          type: "file" as const,
          filename: "dummy.jks",
          content: "AAECAw==",
          createdAt: 0,
        },
        {
          id: "totp",
          name: "2FA",
          type: "totp" as const,
          content: "otpauth://totp/Dummy?secret=JBSWY3DPEHPK3PXP",
          createdAt: 0,
        },
      ],
    };
    const code = await encryptVaultBackup(payload, key);
    expect(code.startsWith("HMVAULT1.1000000.")).toBe(true);
    const restored = parsePayload(await unlockText(code, key));
    expect(restored.seeds.map((s) => [s.id, s.words, s.fingerprint])).toEqual([
      ["seed", SEED, "73c5da0a"],
    ]);
    expect(restored.secrets.map((s) => s.type)).toEqual(["note", "file", "totp"]);
    expect(restored.secrets[1].content).toBe("AAECAw==");
    await expect(unlockText(code, "different key")).rejects.toThrow("Wrong password");
  });
  it("device copying adds missing entries, skips duplicates and never deletes receiver entries", () => {
    const note = {
      id: "note",
      name: "Original",
      type: "note" as const,
      content: "same",
      createdAt: 0,
    };
    const current = { ...emptyVault(), seeds: [e("existing", SEED)], secrets: [note] };
    const incoming = {
      ...emptyVault(),
      seeds: [e("duplicate", SEED)],
      secrets: [
        { ...note, name: "Changed label" },
        { ...note, id: "new", content: "new" },
      ],
    };
    const r = mergeVaultBackup(current, incoming);
    expect(r.addedSeeds).toBe(0);
    expect(r.addedSecrets).toBe(1);
    expect(r.skipped).toBe(2);
    expect(r.payload.seeds).toEqual(current.seeds);
    expect(r.payload.secrets).toEqual([note, incoming.secrets[1]]);
    expect(current.secrets).toEqual([note]);
  });
  it("restore skips a seed already in the vault", () => {
    const r = mergeSeeds([e("a", SEED)], [e("b", SEED), e("c", "zoo zoo")]);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.seeds).toHaveLength(2);
  });
  it("same words with a different passphrase count as a different seed", () => {
    expect(mergeSeeds([e("a", SEED)], [e("b", SEED, "extra")]).added).toBe(1);
  });
  it("no wait for the first 10 wrong passwords, then 30s doubling, capped at 1 hour", () => {
    expect(lockoutMs(9)).toBe(0);
    expect(lockoutMs(10)).toBe(30_000);
    expect(lockoutMs(11)).toBe(60_000);
    expect(lockoutMs(40)).toBe(3_600_000);
  });
  it("auto-locks after 2 minutes idle", () => {
    expect(shouldAutoLock(0, 119_999)).toBe(false);
    expect(shouldAutoLock(0, 120_000)).toBe(true);
  });
  it("derives the known fingerprint and Ethereum address for the test seed", async () => {
    const k = await deriveKeys(SEED);
    expect(k.fingerprint).toBe("73c5da0a");
    expect(k.evmAddress.toLowerCase()).toBe("0x9858effd232b4033e47d90003d41ec34ecaeda94");
  });
  it("derives the first TXC legacy address at the exact displayed comparison path", async () => {
    expect(TXC_ADDRESS_PATH).toBe("m/44'/696969'/0'/0/0");
    const k = await deriveKeys(SEED);
    expect(k.txcAddress).toBe("TZZCuca5ntPVCJL5ryTjh465Jvw5vHxsVd");
    expect((await deriveKeys(SEED.toUpperCase())).txcAddress).toBe(k.txcAddress);
  });
  it("changes the TXC comparison address when the seed passphrase changes", async () => {
    expect((await deriveKeys(SEED, "different passphrase")).txcAddress).not.toBe(
      "TZZCuca5ntPVCJL5ryTjh465Jvw5vHxsVd",
    );
  });
  it("exports the standard public EVM account key at m/44'/60'/0'", async () => {
    const pairing = JSON.parse(await pairingPayload(SEED));
    const root = HDKey.fromMasterSeed(await mnemonicToSeed(SEED));
    const account = HDKey.fromExtendedKey(pairing.evm.xpub);
    expect(pairing.evm.xpub).toBe(root.derive("m/44'/60'/0'").publicExtendedKey);
    expect(pairing.evm.xpub.startsWith("xpub")).toBe(true);
    expect(account.versions.public).toBe(0x0488b21e);
    expect(account.depth).toBe(3);
    expect(account.privateKey).toBeNull();
  });
  for (const passphrase of ["", "Nectar dummy passphrase"]) {
    it(`filters Nectar pairing to exactly hmvault, fp and evm.xpub (${passphrase ? "with" : "without"} passphrase)`, async () => {
      const full = await pairingPayload(SEED, passphrase);
      const pairing = JSON.parse(full);
      const nectar = JSON.parse(nectarPairingPayload(full));
      expect(nectar).toEqual({
        hmvault: 1,
        fp: pairing.fp,
        evm: { xpub: pairing.evm.xpub },
      });
      expect(Object.keys(nectar).sort()).toEqual(["evm", "fp", "hmvault"]);
      expect(Object.keys(nectar.evm)).toEqual(["xpub"]);
      expect(JSON.parse(full)).toEqual(pairing);
    });
  }
  it("fits Nectar pairing into one frame of the HMQR2 transport", async () => {
    const nectar = nectarPairingPayload(await pairingPayload(SEED));
    expect(PART_SIZE).toBe(600);
    expect(nectar.length).toBeLessThanOrEqual(600);
    expect(toParts(nectar)).toEqual([nectar]);
  });
  it("preserves all existing pairing fields when adding the EVM xpub", async () => {
    const pairing = JSON.parse(await pairingPayload(SEED));
    const root = HDKey.fromMasterSeed(await mnemonicToSeed(SEED));
    const accounts = (coin: number) =>
      Object.fromEntries(
        [84, 49, 44].map((purpose) => [
          purpose,
          root.derive(`m/${purpose}'/${coin}'/0'`).publicExtendedKey,
        ]),
      );
    const { xpub: _xpub, ...legacyEvm } = pairing.evm;
    const { bch: _bch, dash: _dash, tron: _tron, sol: _sol, ...legacyPairing } = pairing;
    expect({ ...legacyPairing, evm: legacyEvm }).toEqual({
      hmvault: 1,
      fp: "73c5da0a",
      txc: accounts(696969),
      isk: accounts(969696),
      btc: accounts(0),
      ltc: accounts(2),
      doge: { "44": root.derive("m/44'/3'/0'").publicExtendedKey },
      evm: {
        address: "0x9858effd232b4033e47d90003d41ec34ecaeda94",
        path: "m/44'/60'/0'/0/0",
      },
    });
  });
  for (const passphrase of ["", "Nectar dummy passphrase"]) {
    it(`exports TRON public account 195 with public receiving derivation (${passphrase || "empty"})`, async () => {
      const full = await pairingPayload(SEED, passphrase);
      const pairing = JSON.parse(full);
      const root = HDKey.fromMasterSeed(await mnemonicToSeed(SEED, passphrase));
      expect(Object.keys(pairing.tron)).toEqual(["44"]);
      expect(pairing.tron["44"]).toBe(root.derive("m/44'/195'/0'").publicExtendedKey);
      const account = HDKey.fromExtendedKey(pairing.tron["44"]);
      expect(account.versions.public).toBe(0x0488b21e);
      expect(account.depth).toBe(3);
      expect(account.privateKey).toBeNull();
      if (!passphrase)
        expect(pairing.tron["44"]).toBe(
          "xpub6D1AabNHCupeiLM65ZR9UStMhJ1vCpyV4XbZdyhMZBiJXALQtmn9p42VTQckoHVn8WNqS7dqnJokZHAHcHGoaQgmv8D45oNUKx6DZMNZBCd",
        );
      for (const index of [0, 1, 2]) {
        const child = account.derive(`m/0/${index}`);
        expect(child.privateKey).toBeNull();
        expect(child.publicKey).toEqual(root.derive(`m/44'/195'/0'/0/${index}`).publicKey);
        if (!child.publicKey) throw new Error("Missing TRON public key");
        const hash = keccak_256(secp256k1.Point.fromHex(child.publicKey).toBytes(false).slice(1));
        const address = base58check(sha256).encode(Uint8Array.of(0x41, ...hash.slice(-20)));
        if (!passphrase && index < 2)
          expect(address).toBe(
            ["TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH", "TSeJkUh4Qv67VNFwY8LaAxERygNdy6NQZK"][index],
          );
      }
      const collector = new PartCollector();
      let restored: string | null = null;
      for (const part of toParts(full)) restored = collector.add(part);
      expect(restored).toBe(full);
    });
    it(`exports only Solana raw public address and hardened path (${passphrase || "empty"})`, async () => {
      const pairing = JSON.parse(await pairingPayload(SEED, passphrase));
      expect(SOLANA_PATH).toBe("m/44'/501'/0'/0'");
      expect(pairing.sol).toEqual({
        address: passphrase
          ? "nfPtm3Bu5wtxSWRN4wxP9C6knv8UR3dUQ8uy3ykUMfi"
          : "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
        path: "m/44'/501'/0'/0'",
      });
      expect(base58.decode(pairing.sol.address)).toHaveLength(32);
      expect(Object.keys(pairing.sol).sort()).toEqual(["address", "path"]);
    });
  }
  for (const [coin, coinType] of [
    ["bch", 145],
    ["dash", 5],
  ] as const) {
    for (const passphrase of ["", "Nectar dummy passphrase"]) {
      it(`exports public-only ${coin} account m/44'/${coinType}'/0' (${passphrase ? "with" : "without"} passphrase)`, async () => {
        const full = await pairingPayload(SEED, passphrase);
        const pairing = JSON.parse(full);
        const root = HDKey.fromMasterSeed(await mnemonicToSeed(SEED, passphrase));
        expect(Object.keys(pairing[coin])).toEqual(["44"]);
        const xpub = pairing[coin]["44"];
        expect(xpub).toBe(root.derive(`m/44'/${coinType}'/0'`).publicExtendedKey);
        expect(xpub.startsWith("xpub")).toBe(true);
        const account = HDKey.fromExtendedKey(xpub);
        expect(account.versions.public).toBe(0x0488b21e);
        expect(account.depth).toBe(3);
        expect(account.privateKey).toBeNull();
        if (!passphrase) {
          expect(xpub).toBe(
            coin === "bch"
              ? "xpub6ByHsPNSQXTWZ7PLESMY2FufyYWtLXagSUpMQq7Un96SiThZH2iJB1X7pwviH1WtKVeDP6K8d6xxFzzoaFzF3s8BKCZx8oEDdDkNnp4owAZ"
              : "xpub6CYEjsU6zPM3sADS2ubu2aZeGxCm3C5KabkCpo4rkNbXGAH9M7rRUJ4E5CKiyUddmRzrSCopPzisTBrXkfCD4o577XKM9mzyZtP1Xdbizyk",
          );
        }
        for (const index of [1, 2]) {
          const child = account.derive(`m/0/${index}`);
          expect(child.privateKey).toBeNull();
          expect(child.publicKey).toEqual(
            root.derive(`m/44'/${coinType}'/0'/0/${index}`).publicKey,
          );
          if (!passphrase) {
            if (!child.publicKey) throw new Error("Missing public child key");
            const address = payments.p2pkh({
              pubkey: child.publicKey,
              network: { ...networks.bitcoin, pubKeyHash: coin === "bch" ? 0 : 76 },
            }).address;
            expect(address).toBe(
              coin === "bch"
                ? ["18Cp2ivkLHyJwHMm9NzDRBh6Gi7m4MC2we", "15Ax9BJRJ4TABF85UsPpz9QvuBpiJhCfsw"][
                    index - 1
                  ]
                : ["XbctnEsgWTn5j1co3emZynemxSFPqkLRKZ", "XdD2biTJ3saZtcR6ravwJ9bvmkvmDq49Xg"][
                    index - 1
                  ],
            );
          }
        }
        const collector = new PartCollector();
        let restored: string | null = null;
        for (const part of toParts(full)) restored = collector.add(part);
        expect(restored).toBe(full);
      });
    }
  }
  for (const passphrase of ["", "Nectar dummy passphrase"]) {
    it(`derives Nectar sale addresses /0/1 and /0/2 without private keys (${passphrase ? "with" : "without"} passphrase)`, async () => {
      const pairing = JSON.parse(await pairingPayload(SEED, passphrase));
      const account = HDKey.fromExtendedKey(pairing.evm.xpub);
      const root = HDKey.fromMasterSeed(await mnemonicToSeed(SEED, passphrase));
      for (const index of [1, 2]) {
        const child = account.derive(`m/0/${index}`);
        const expected = root.derive(`m/44'/60'/0'/0/${index}`);
        expect(child.privateKey).toBeNull();
        expect(child.publicKey).toEqual(expected.publicKey);
        if (!child.publicKey) throw new Error("Missing public child key");
        const uncompressed = secp256k1.Point.fromHex(child.publicKey).toBytes(false);
        const hex =
          `0x${Array.from(uncompressed, (b) => b.toString(16).padStart(2, "0")).join("")}` as const;
        const address = publicKeyToAddress(hex);
        expect(address.toLowerCase()).not.toBe(pairing.evm.address.toLowerCase());
        if (!passphrase && index === 1)
          expect(address.toLowerCase()).toBe("0x6fac4d18c912343bf86fa7049364dd4e424ab9c0");
      }
    });
  }
});

import { parsePayload as _parse, seedFingerprint as _fp, MAX_SEED_NAME as _max } from "./seeds";
describe("backup import hardening", () => {
  const words =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  it("recomputes the fingerprint, normalizes words, caps names and drops duplicates", () => {
    const p = _parse(
      JSON.stringify({
        v: 1,
        kind: "hm-seed-vault",
        secrets: [],
        seeds: [
          {
            id: "a",
            name: "Main\u202e" + "x".repeat(300),
            words:
              "  ABANDON abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ABOUT ",
            fingerprint: "deadbeef",
            createdAt: 1,
          },
          { id: "b", name: "Copy", words, fingerprint: "00000000", createdAt: 2 },
        ],
      }),
    );
    expect(p.seeds).toHaveLength(1);
    expect(p.seeds[0].words).toBe(words);
    expect(p.seeds[0].fingerprint).toBe(_fp(words));
    expect(p.seeds[0].fingerprint).not.toBe("deadbeef");
    expect(p.seeds[0].name.length).toBe(_max);
    expect(p.seeds[0].name).not.toContain("\u202e");
  });
});
