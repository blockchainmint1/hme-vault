/**
 * Air-gapped PSBT review + signing for TXC / ISK (Bitcoin-style chains).
 *
 * The online wallet builds a standard BIP-174 PSBT that carries, for every
 * input, the previous output (witnessUtxo or nonWitnessUtxo) and a
 * bip32Derivation (master fingerprint + path). Change outputs carry a
 * bip32Derivation too. This module checks all of it against the stored seeds
 * before anything is signed. No network access.
 */
import { address as baddress, payments, Psbt, Transaction } from "bitcoinjs-lib";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { NETWORKS, coinFromCoinType, type CoinId } from "./networks";

export interface SignerSeed {
  id: string;
  name: string;
  words: string;
  passphrase?: string;
  fingerprint: string;
}

export interface ReviewOutput {
  address: string;
  sats: bigint;
  isChange: boolean;
  isData: boolean;
}

export interface Review {
  coin: CoinId;
  seedName: string;
  inputsSats: bigint;
  sendSats: bigint;
  changeSats: bigint;
  feeSats: bigint;
  outputs: ReviewOutput[];
  warnings: string[];
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fpHex = (b: Uint8Array) => hex(b).padStart(8, "0");

function pathToArray(path: string): number[] {
  return path.replace(/^m\//, "").split("/").map((p) => (p.endsWith("'") || p.endsWith("h") ? (parseInt(p) + 0x80000000) >>> 0 : parseInt(p)));
}

export function parsePsbt(text: string): Psbt {
  const t = text.trim();
  try {
    return /^[0-9a-f]+$/i.test(t) ? Psbt.fromHex(t, { network: NETWORKS.TXC }) : Psbt.fromBase64(t, { network: NETWORKS.TXC });
  } catch {
    throw new Error("That QR isn't an unsigned payment (PSBT).");
  }
}

const rootCache = new Map<string, HDKey>();
async function rootFor(s: SignerSeed): Promise<HDKey> {
  const k = `${s.id}`;
  const hit = rootCache.get(k);
  if (hit) return hit;
  const root = HDKey.fromMasterSeed(await mnemonicToSeed(s.words, s.passphrase ?? ""));
  rootCache.set(k, root);
  return root;
}
export function clearSignerCache() {
  rootCache.clear();
}

function inputValue(psbt: Psbt, i: number): bigint {
  const inp = psbt.data.inputs[i];
  if (inp.witnessUtxo) return BigInt(inp.witnessUtxo.value);
  if (inp.nonWitnessUtxo) {
    const prev = Transaction.fromBuffer(inp.nonWitnessUtxo as Buffer);
    const txin = psbt.txInputs[i];
    const prevHash = hex(Uint8Array.from(prev.getHash()));
    if (prevHash !== hex(Uint8Array.from(txin.hash))) throw new Error(`Input ${i + 1} carries the wrong previous transaction.`);
    return BigInt(prev.outs[txin.index].value);
  }
  throw new Error(`Input ${i + 1} doesn't say how much it's worth, so it can't be checked.`);
}

/** Script our key would produce for this path's purpose (44 = legacy, 49 = wrapped segwit, 84 = segwit). */
function scriptFor(pubkey: Uint8Array, purpose: number, coin: CoinId): Uint8Array | undefined {
  const network = NETWORKS[coin];
  const pk = pubkey as Buffer;
  if (purpose === 84) return payments.p2wpkh({ pubkey: pk, network }).output;
  if (purpose === 49) return payments.p2sh({ redeem: payments.p2wpkh({ pubkey: pk, network }), network }).output;
  if (purpose === 44) return payments.p2pkh({ pubkey: pk, network }).output;
  return undefined;
}

interface Owned { seed: SignerSeed; key: HDKey; coin: CoinId }

async function ownerOf(derivs: { masterFingerprint: Uint8Array; path: string; pubkey: Uint8Array }[] | undefined, seeds: SignerSeed[]): Promise<Owned | null> {
  for (const d of derivs ?? []) {
    const seed = seeds.find((s) => s.fingerprint === fpHex(d.masterFingerprint));
    if (!seed) continue;
    const parts = pathToArray(d.path);
    const coin = coinFromCoinType((parts[1] ?? 0) - 0x80000000);
    if (!coin) continue;
    const key = (await rootFor(seed)).derive(d.path);
    if (key.publicKey && hex(key.publicKey) === hex(d.pubkey)) return { seed, key, coin };
  }
  return null;
}

export async function reviewPsbt(psbt: Psbt, seeds: SignerSeed[]): Promise<{ review: Review; keys: HDKey[] }> {
  if (psbt.inputCount === 0) throw new Error("This payment has no inputs.");
  const warnings: string[] = [];
  const keys: HDKey[] = [];
  let coin: CoinId | null = null;
  let seedName = "";
  let inputsSats = 0n;

  for (let i = 0; i < psbt.inputCount; i++) {
    const inp = psbt.data.inputs[i];
    const own = await ownerOf(inp.bip32Derivation, seeds);
    if (!own) throw new Error(`Input ${i + 1} doesn't belong to any seed in this vault.`);
    if (coin && coin !== own.coin) throw new Error("This payment mixes coins. Refusing to sign.");
    coin = own.coin;
    seedName = own.seed.name;
    const d = inp.bip32Derivation!.find((x) => fpHex(x.masterFingerprint) === own.seed.fingerprint)!;
    const purpose = pathToArray(d.path)[0] - 0x80000000;
    const expected = scriptFor(own.key.publicKey!, purpose, own.coin);
    const actual = inp.witnessUtxo?.script ?? (inp.nonWitnessUtxo ? Transaction.fromBuffer(inp.nonWitnessUtxo as Buffer).outs[psbt.txInputs[i].index].script : undefined);
    if (!expected || !actual || hex(Uint8Array.from(expected)) !== hex(Uint8Array.from(actual))) throw new Error(`Input ${i + 1} isn't an address from your seed.`);
    inputsSats += inputValue(psbt, i);
    keys.push(own.key);
  }

  const network = NETWORKS[coin!];
  const outputs: ReviewOutput[] = [];
  let sendSats = 0n;
  let changeSats = 0n;
  for (let i = 0; i < psbt.txOutputs.length; i++) {
    const o = psbt.txOutputs[i];
    const sats = BigInt(o.value);
    const isData = o.script[0] === 0x6a;
    let addr = "Data (OP_RETURN)";
    if (!isData) {
      try { addr = baddress.fromOutputScript(o.script, network); } catch { throw new Error(`Output ${i + 1} isn't a ${coin} address.`); }
    }
    let isChange = false;
    const own = isData ? null : await ownerOf(psbt.data.outputs[i]?.bip32Derivation, seeds);
    if (own && own.coin === coin) {
      const d = psbt.data.outputs[i].bip32Derivation!.find((x) => fpHex(x.masterFingerprint) === own.seed.fingerprint)!;
      const exp = scriptFor(own.key.publicKey!, pathToArray(d.path)[0] - 0x80000000, own.coin);
      isChange = !!exp && hex(Uint8Array.from(exp)) === hex(Uint8Array.from(o.script));
    }
    if (isChange) changeSats += sats; else sendSats += sats;
    outputs.push({ address: addr, sats, isChange, isData });
  }
  const feeSats = inputsSats - sendSats - changeSats;
  if (feeSats < 0n) throw new Error("This payment spends more than its inputs hold.");
  if (outputs.some((o) => o.isData)) warnings.push("Includes a data output — usually a token (e.g. TSD) transfer. The token amount can't be shown yet.");
  if (sendSats > 0n && feeSats * 20n > sendSats) warnings.push("The network fee is more than 5% of what you're sending.");
  if (feeSats > 100_000_000n) warnings.push("The network fee is over 1 coin. Check this carefully.");

  return { review: { coin: coin!, seedName, inputsSats, sendSats, changeSats, feeSats, outputs, warnings }, keys };
}

export function signPsbt(psbt: Psbt, keys: HDKey[]): { hex: string; txid: string } {
  keys.forEach((k, i) => {
    psbt.signInput(i, { publicKey: k.publicKey! as Buffer, sign: (hash: Buffer) => k.sign(hash) as Buffer });
  });
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return { hex: tx.toHex(), txid: tx.getId() };
}

export function formatCoins(sats: bigint): string {
  const neg = sats < 0n;
  const v = neg ? -sats : sats;
  const whole = v / 100_000_000n;
  const frac = (v % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}
