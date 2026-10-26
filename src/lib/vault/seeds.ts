/** Pure seed-vault helpers: payload shape, merge, lockout, key info. No storage, no network. */
import { HDKey } from "@scure/bip32";
import { HDKey as Ed25519HDKey } from "micro-key-producer/slip10.js";
import { base58, base58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { encodeCashAddrP2PKH } from "./cashaddr";
import {
  mnemonicToSeed,
  mnemonicToSeedSync,
  generateMnemonic,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { payments } from "bitcoinjs-lib";
import { NETWORKS } from "../signer/networks";
import { lockText, normalizeSeed } from "./format";
import { mergeSecrets, validateSecret, MAX_VAULT_CHARS, type SecretEntry } from "./secrets";

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

export const emptyVault = (): VaultPayload => ({
  v: 1,
  kind: "hm-seed-vault",
  seeds: [],
  secrets: [],
});

/** Remind for additions, not reads, renames or deletions. */
export function hasNewVaultEntries(
  previous: Pick<VaultPayload, "seeds" | "secrets">,
  next: Pick<VaultPayload, "seeds" | "secrets">,
): boolean {
  const seedIds = new Set(previous.seeds.map((s) => s.id));
  const secretIds = new Set(previous.secrets.map((s) => s.id));
  return (
    next.seeds.some((s) => !seedIds.has(s.id)) || next.secrets.some((s) => !secretIds.has(s.id))
  );
}

/** Backups use the current Vault credential, never a separate backup password. */
export async function encryptVaultBackup(
  payload: VaultPayload,
  vaultCredential: string,
): Promise<string> {
  const text = JSON.stringify(payload);
  if (text.length > MAX_VAULT_CHARS)
    throw new Error("Vault is too large. Use a smaller collection.");
  return lockText(text, vaultCredential);
}

/** Offline copying is additive: never overwrite or delete the receiver's entries. */
export function mergeVaultBackup(existing: VaultPayload, incoming: VaultPayload) {
  const seeds = mergeSeeds(existing.seeds, incoming.seeds);
  const secrets = mergeSecrets(existing.secrets, incoming.secrets);
  return {
    payload: { ...emptyVault(), seeds: seeds.seeds, secrets: secrets.secrets },
    addedSeeds: seeds.added,
    addedSecrets: secrets.added,
    skipped: seeds.skipped + secrets.skipped,
  };
}

export function parsePayload(text: string): VaultPayload {
  if (text.length > MAX_VAULT_CHARS)
    throw new Error("Vault is too large. Use a smaller collection.");
  const j = JSON.parse(text) as Partial<VaultPayload>;
  if (
    j?.v !== 1 ||
    j.kind !== "hm-seed-vault" ||
    !Array.isArray(j.seeds) ||
    (j.secrets !== undefined && !Array.isArray(j.secrets))
  )
    throw new Error("That isn't a supported Vault backup.");
  const seeds: SeedEntry[] = [];
  for (const s of j.seeds) {
    if (
      !s ||
      typeof s.id !== "string" ||
      typeof s.name !== "string" ||
      typeof s.words !== "string" ||
      !isValidSeed(s.words) ||
      !Number.isFinite(s.createdAt) ||
      (s.passphrase !== undefined && typeof s.passphrase !== "string")
    )
      throw new Error("Invalid seed in backup.");
    const words = normalizeSeed(s.words);
    const passphrase = s.passphrase || undefined;
    // Never trust a stored fingerprint: a crafted backup could disguise a look-alike seed.
    const entry: SeedEntry = {
      id: s.id.slice(0, 64),
      name: cleanSeedName(s.name),
      words,
      ...(passphrase ? { passphrase } : {}),
      fingerprint: seedFingerprint(words, passphrase ?? ""),
      createdAt: s.createdAt,
    };
    if (seeds.some((e) => sameSeed(e, entry))) continue;
    seeds.push(entry);
  }
  return { v: 1, kind: "hm-seed-vault", seeds, secrets: (j.secrets ?? []).map(validateSecret) };
}

export const MAX_SEED_NAME = 80;
/** Strip control/invisible characters and cap length so names can't impersonate others. */
export function cleanSeedName(name: string): string {
  const clean = name
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex -- deliberately strips control characters from names
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEED_NAME);
  return clean || "Imported seed";
}

export function seedFingerprint(words: string, passphrase = ""): string {
  return HDKey.fromMasterSeed(mnemonicToSeedSync(normalizeSeed(words), passphrase))
    .fingerprint.toString(16)
    .padStart(8, "0");
}

export function isValidSeed(words: string): boolean {
  return validateMnemonic(normalizeSeed(words), wordlist);
}

export function newSeedWords(count: 12 | 24): string {
  return generateMnemonic(wordlist, count === 24 ? 256 : 128);
}

const sameSeed = (a: SeedEntry, b: SeedEntry) =>
  normalizeSeed(a.words) === normalizeSeed(b.words) &&
  (a.passphrase ?? "") === (b.passphrase ?? "");

/** Merge restored seeds in; a seed with the same words + passphrase is skipped. */
export function mergeSeeds(
  existing: SeedEntry[],
  incoming: SeedEntry[],
): { seeds: SeedEntry[]; added: number; skipped: number } {
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
  txcAddress: string;
  evmAddress: string;
}

export const TXC_ACCOUNT_PATH = "m/44'/696969'/0'";
export const TXC_ADDRESS_PATH = `${TXC_ACCOUNT_PATH}/0/0`;
export const EVM_PATH = "m/44'/60'/0'/0/0";
export const SOLANA_PATH = "m/44'/501'/0'/0'";

export async function deriveKeys(words: string, passphrase = ""): Promise<SeedKeys> {
  const root = HDKey.fromMasterSeed(await mnemonicToSeed(normalizeSeed(words), passphrase));
  const fingerprint = root.fingerprint.toString(16).padStart(8, "0");
  const txc = root.derive(TXC_ACCOUNT_PATH);
  const txcKey = root.derive(TXC_ADDRESS_PATH);
  if (!txcKey.publicKey) throw new Error("Could not derive TXC public key.");
  const txcAddress = payments.p2pkh({ pubkey: txcKey.publicKey, network: NETWORKS.TXC }).address;
  if (!txcAddress) throw new Error("Could not derive TXC address.");
  const evm = root.derive(EVM_PATH);
  if (!evm.privateKey) throw new Error("Could not derive seed key.");
  const pub = secp256k1.getPublicKey(evm.privateKey, false).slice(1);
  const addr = Array.from(keccak_256(pub).slice(-20), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return { fingerprint, txcXpub: txc.publicExtendedKey, txcAddress, evmAddress: `0x${addr}` };
}

/**
 * Watch-only pairing for the online wallet (JSON, safe to share): master
 * fingerprint plus account xpubs for supported coins, and the EVM address/path.
 * Format: docs/offline-signing-handoff.md.
 */
export async function pairingPayload(words: string, passphrase = ""): Promise<string> {
  const seed = await mnemonicToSeed(normalizeSeed(words), passphrase);
  const root = HDKey.fromMasterSeed(seed);
  // SLIP-0010 ed25519 cannot derive hardened children from a public key.
  // Export only one raw public address, never its private key or chain code.
  const sol = {
    address: base58.encode(Ed25519HDKey.fromMasterSeed(seed).derive(SOLANA_PATH).publicKeyRaw),
    path: SOLANA_PATH,
  };
  seed.fill(0);
  const fp = root.fingerprint.toString(16).padStart(8, "0");
  const acct = (ct: number) => ({
    "84": root.derive(`m/84'/${ct}'/0'`).publicExtendedKey,
    "49": root.derive(`m/49'/${ct}'/0'`).publicExtendedKey,
    "44": root.derive(`m/44'/${ct}'/0'`).publicExtendedKey,
  });
  const evm = await deriveKeys(words, passphrase);
  return JSON.stringify({
    hmvault: 1,
    fp,
    txc: acct(696969),
    isk: acct(969696),
    btc: acct(0),
    ltc: acct(2),
    doge: { "44": root.derive("m/44'/3'/0'").publicExtendedKey },
    bch: { "44": root.derive("m/44'/145'/0'").publicExtendedKey },
    dash: { "44": root.derive("m/44'/5'/0'").publicExtendedKey },
    tron: { "44": root.derive("m/44'/195'/0'").publicExtendedKey },
    sol,
    evm: {
      address: evm.evmAddress,
      path: EVM_PATH,
      xpub: root.derive("m/44'/60'/0'").publicExtendedKey,
    },
  });
}

/** Nectar receives only the EVM public account key from the full pairing payload. */
export function nectarPairingPayload(fullPairing: string): string {
  const pairing = JSON.parse(fullPairing) as {
    hmvault: 1;
    fp: string;
    evm: { xpub: string };
  };
  return JSON.stringify({
    hmvault: pairing.hmvault,
    fp: pairing.fp,
    evm: { xpub: pairing.evm.xpub },
  });
}

export const RECEIVE_COINS = [
  "TXC",
  "ISK",
  "BTC",
  "LTC",
  "DOGE",
  "BCH",
  "DASH",
  "EVM",
  "ZCU",
  "TRON",
  "SOL",
] as const;
export type ReceiveCoin = (typeof RECEIVE_COINS)[number];
export interface ReceivingAddress {
  address: string;
  path: string;
  fingerprint: string;
  format: string;
}

/** First receiving address only; public children of the SAME accounts exported for pairing. */
export async function receivingAddress(
  words: string,
  passphrase: string,
  coin: ReceiveCoin,
): Promise<ReceivingAddress> {
  if (!RECEIVE_COINS.includes(coin)) throw new Error("Unsupported receiving network.");
  const pairing = JSON.parse(await pairingPayload(words, passphrase));
  const common = { fingerprint: pairing.fp };
  if (coin === "SOL") return { ...common, ...pairing.sol, format: "Solana · fixed address" };
  if (coin === "EVM" || coin === "ZCU")
    return { ...common, address: pairing.evm.address, path: pairing.evm.path, format: "EVM" };
  const purpose = coin === "BTC" || coin === "LTC" ? "84" : "44";
  const coinType = {
    TXC: 696969,
    ISK: 969696,
    BTC: 0,
    LTC: 2,
    DOGE: 3,
    BCH: 145,
    DASH: 5,
    TRON: 195,
  }[coin];
  const account = HDKey.fromExtendedKey(pairing[coin.toLowerCase()][purpose]);
  const publicKey = account.derive("m/0/0").publicKey;
  if (!publicKey) throw new Error("Could not derive receiving public key.");
  const path = `m/${purpose}'/${coinType}'/0'/0/0`;
  if (coin === "TRON") {
    const hash = keccak_256(secp256k1.Point.fromHex(publicKey).toBytes(false).slice(1));
    return {
      ...common,
      path,
      address: base58check(sha256).encode(Uint8Array.of(0x41, ...hash.slice(-20))),
      format: "TRON",
    };
  }
  if (coin === "BCH")
    return {
      ...common,
      path,
      address: encodeCashAddrP2PKH(ripemd160(sha256(publicKey))),
      format: "CashAddr · P2PKH",
    };
  const network = coin === "DASH" ? { ...NETWORKS.BTC, pubKeyHash: 0x4c } : NETWORKS[coin];
  const address =
    purpose === "84"
      ? payments.p2wpkh({ pubkey: publicKey, network }).address
      : payments.p2pkh({ pubkey: publicKey, network }).address;
  if (!address) throw new Error("Could not derive receiving address.");
  return {
    ...common,
    address,
    path,
    format: purpose === "84" ? "Native SegWit · P2WPKH" : "Legacy · P2PKH",
  };
}
