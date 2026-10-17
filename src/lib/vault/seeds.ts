/** Pure seed-vault helpers: payload shape, merge, lockout, key info. No storage, no network. */
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed, generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { normalizeSeed } from "./format";
import { validateSecret, MAX_VAULT_CHARS, type SecretEntry } from "./secrets";

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
  secrets: SecretEntry[];
}

export const emptyVault = (): VaultPayload => ({ v: 1, kind: "hm-seed-vault", seeds: [], secrets: [] });

export function parsePayload(text: string): VaultPayload {
  if (text.length > MAX_VAULT_CHARS) throw new Error("Vault is too large. Use a smaller collection.");
  const j = JSON.parse(text) as Partial<VaultPayload>;
  if (j?.v !== 1 || j.kind !== "hm-seed-vault" || !Array.isArray(j.seeds) || (j.secrets !== undefined && !Array.isArray(j.secrets))) throw new Error("That isn't a supported Vault backup.");
  for (const s of j.seeds) {
    if (!s || typeof s.id !== "string" || typeof s.name !== "string" || typeof s.words !== "string" || !isValidSeed(s.words) || typeof s.fingerprint !== "string" || !Number.isFinite(s.createdAt) || (s.passphrase !== undefined && typeof s.passphrase !== "string")) throw new Error("Invalid seed in backup.");
  }
  return { v: 1, kind: "hm-seed-vault", seeds: j.seeds, secrets: (j.secrets ?? []).map(validateSecret) };
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
  if (!evm.privateKey) throw new Error("Could not derive seed key.");
  const pub = secp256k1.getPublicKey(evm.privateKey, false).slice(1);
  const addr = Array.from(keccak_256(pub).slice(-20), (b) => b.toString(16).padStart(2, "0")).join("");
  return { fingerprint, txcXpub: txc.publicExtendedKey, evmAddress: `0x${addr}` };
}

/**
 * Watch-only pairing for the online wallet (JSON, safe to share): master
 * fingerprint plus account xpubs for supported coins, and the EVM address/path.
 * Format: docs/offline-signing-handoff.md.
 */
export async function pairingPayload(words: string, passphrase = ""): Promise<string> {
  const root = HDKey.fromMasterSeed(await mnemonicToSeed(normalizeSeed(words), passphrase));
  const fp = root.fingerprint.toString(16).padStart(8, "0");
  const acct = (ct: number) => ({
    "84": root.derive(`m/84'/${ct}'/0'`).publicExtendedKey,
    "49": root.derive(`m/49'/${ct}'/0'`).publicExtendedKey,
    "44": root.derive(`m/44'/${ct}'/0'`).publicExtendedKey,
  });
  const evm = await deriveKeys(words, passphrase);
  return JSON.stringify({ hmvault: 1, fp, txc: acct(696969), isk: acct(969696), btc: acct(0), ltc: acct(2), doge: { "44": root.derive("m/44'/3'/0'").publicExtendedKey }, evm: { address: evm.evmAddress, path: EVM_PATH } });
}
