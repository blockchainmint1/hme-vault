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
  type SeedEntry,
} from "./seeds";
import { unlockText } from "./format";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { publicKeyToAddress } from "viem/accounts";
import { secp256k1 } from "@noble/curves/secp256k1";
import { pairingPayload } from "./seeds";

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
    expect({ ...pairing, evm: legacyEvm }).toEqual({
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
