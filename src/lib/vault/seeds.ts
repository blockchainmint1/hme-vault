/** Pure seed-vault helpers: payload shape, merge, lockout, key info. No storage, no network. */
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed, generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { normalizeSeed } from "./format";

export interface SeedEntry {
  id: string;
  name: string;
  words: string;
  passphrase?: string;
  fingerprint: string;
  createdAt: number;
}

export interface VaultPayload {
  v: 1;
  kind: "hm-seed-vault";
  seeds: SeedEntry[];
}

export const emptyVault = (): VaultPayload => ({ v: 1, kind: "hm-seed-vault", seeds: [] });

export function parsePayload(text: string): VaultPayload {
  const j = JSON.parse(text) as Partial<VaultPayload>;
  if (j?.kind !== "hm-seed-vault" || !Array.isArray(j.seeds)) throw new Error("That backup isn't a Seed Vault backup.");
  return { v: 1, kind: "hm-seed-vault", seeds: j.seeds };
}

export function isValidSeed(words: string): boolean {
  return validateMnemonic(normalizeSeed(words), wordlist);
}

export function newSeedWords(count: 12 | 24): string {
  return generateMnemonic(wordlist, count === 24 ? 256 : 128);
}

const sameSeed = (a: SeedEntry, b: SeedEntry) => a.words === b.words && (a.passphrase ?? "") === (b.passphrase ?? "");

/** Merge restored seeds in; a seed with the same words + passphrase is skipped. */
export function mergeSeeds(existing: SeedEntry[], incoming: SeedEntry[]): { seeds: SeedEntry[]; added: number; skipped: number } {
  const out = [...existing];
  let added = 0;
  let skipped = 0;
  for (const s of incoming) {
    if (out.some((e) => sameSeed(e, s))) skipped++;
    else {
      out.push(out.some((e) => e.id === s.id) ? { ...s, id: crypto.randomUUID() } : s);
      added++;
    }
  }
  return { seeds: out, added, skipped };
}

/** Free attempts before waits start, then 30s doubling up to 1 hour. */
export const FREE_ATTEMPTS = 10;
export function lockoutMs(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  return Math.min(30_000 * 2 ** (failures - FREE_ATTEMPTS), 3_600_000);
}

export const IDLE_LOCK_MS = 2 * 60_000;
export const REVEAL_HIDE_MS = 60_000;
export function shouldAutoLock(lastActivity: number, now: number): boolean {
  return now - lastActivity >= IDLE_LOCK_MS;
}

export interface SeedKeys {
  fingerprint: string;
  txcXpub: string;
  evmAddress: string;
}

export const TXC_ACCOUNT_PATH = "m/44'/696969'/0'";
export const EVM_PATH = "m/44'/60'/0'/0/0";

export async function deriveKeys(words: string, passphrase = ""): Promise<SeedKeys> {
  const root = HDKey.fromMasterSeed(await mnemonicToSeed(normalizeSeed(words), passphrase));
  const fingerprint = root.fingerprint.toString(16).padStart(8, "0");
  const txc = root.derive(TXC_ACCOUNT_PATH);
  const evm = root.derive(EVM_PATH);
  const pub = secp256k1.getPublicKey(evm.privateKey!, false).slice(1);
  const addr = Array.from(keccak_256(pub).slice(-20), (b) => b.toString(16).padStart(2, "0")).join("");
  return { fingerprint, txcXpub: txc.publicExtendedKey, evmAddress: `0x${addr}` };
}
