/** Offline BIP-174 review/signing. The user explicitly selects the network: PSBT has no chain ID. */
import { address as baddress, payments, Psbt, Transaction } from "bitcoinjs-lib";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { NETWORKS, coinFromCoinType, type CoinId } from "./networks";

export interface SignerSeed { id: string; name: string; words: string; passphrase?: string; fingerprint: string }
export interface ReviewOutput { address: string; sats: bigint; isChange: boolean; isData: boolean }
export interface TokenSend { propertyId: number; symbol: string; amount: string; to: string | null }
export interface Review { coin: CoinId; seedName: string; inputsSats: bigint; sendSats: bigint; changeSats: bigint; feeSats: bigint; feeRateMinimum: bigint; maximumVsize: number; outputs: ReviewOutput[]; token: TokenSend | null; warnings: string[] }
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const KNOWN_TOKENS: Record<number, { symbol: string; divisible: boolean }> = { 39: { symbol: "TSD", divisible: true } };
// Preserve the existing last-resort cap explicitly; no online quote can raise it.
export const MAX_FEE_RATE = 5_000;
const approvals = new WeakMap<Psbt, { snapshot: string; keys: HDKey[]; coin: CoinId }>();

function validateDataOutputs(psbt: Psbt, coin: CoinId) {
  const data = psbt.txOutputs.filter((o) => o.script[0] === 0x6a);
  if (data.some((o) => !(coin === "TXC" || coin === "ISK") || !decodeOmniSimpleSend(o.script))) {
    throw new Error("Signing blocked: Vault cannot verify these swap or data instructions. THORChain swaps are not supported yet. Nothing was returned for broadcasting.");
  }
  if (data.length > 1 || data.some((o) => o.value !== 0n)) throw new Error("Signing blocked: token payments require one zero-value Omni Simple Send data output.");
}

function maximumSignedVsize(psbt: Psbt, purposes: number[]): number {
  const tx = new Transaction();
  tx.version = psbt.version;
  tx.locktime = psbt.locktime;
  psbt.txInputs.forEach((input, i) => {
    // Maximum DER signature including sighash plus compressed pubkey, for the supported scripts.
    const purpose = purposes[i];
    tx.addInput(input.hash, input.index, input.sequence, new Uint8Array(purpose === 44 ? 108 : purpose === 49 ? 23 : 0));
    if (purpose !== 44) tx.setWitness(i, [new Uint8Array(73), new Uint8Array(33)]);
  });
  psbt.txOutputs.forEach((o) => tx.addOutput(o.script, o.value));
  return tx.virtualSize();
}

function feeError(coin: CoinId, fee: bigint) {
  return new Error(`Signing blocked: the ${formatCoins(fee)} ${coin} fee exceeds Vault's safety limit of ${MAX_FEE_RATE} base units per virtual byte. Ask your online wallet to rebuild the payment with a checked ${coin} fee. Nothing was returned for broadcasting.`);
}

export function decodeOmniSimpleSend(script: Uint8Array): { propertyId: number; amount: bigint } | null {
  const h = hex(script);
  // OP_RETURN, one exact 20-byte push, Omni marker, version 0 and Simple Send type 0.
  if (!/^6a146f6d6e6900000000[0-9a-f]{24}$/.test(h)) return null;
  const p = h.slice(12);
  return { propertyId: parseInt(p.slice(8, 16), 16), amount: BigInt("0x" + p.slice(16, 32)) };
}

function pathParts(path: string): { purpose: number; ct: number } | null {
  const m = /^m\/(44|49|84)'\/(0|2|3|696969|969696)'\/(\d+)'\/(0|1)\/(\d+)$/.exec(path);
  if (!m || Number(m[3]) > 1_000_000 || Number(m[5]) > 1_000_000) return null;
  return { purpose: Number(m[1]), ct: Number(m[2]) };
}

export function parsePsbt(text: string, coin: CoinId = "TXC"): Psbt {
  const t = text.trim();
  if (t.length > 250_000) throw new Error("Unsigned payment is too large.");
  try { return /^[0-9a-f]+$/i.test(t) ? Psbt.fromHex(t, { network: NETWORKS[coin] }) : Psbt.fromBase64(t, { network: NETWORKS[coin] }); }
  catch { throw new Error("That QR isn't an unsigned payment (PSBT)."); }
}

function previousOutput(psbt: Psbt, i: number) {
  const inp = psbt.data.inputs[i];
  if (!inp.nonWitnessUtxo) return undefined;
  const prev = Transaction.fromBuffer(inp.nonWitnessUtxo);
  const txin = psbt.txInputs[i];
  if (hex(prev.getHash()) !== hex(txin.hash)) throw new Error(`Input ${i + 1} carries the wrong previous transaction.`);
  const out = prev.outs[txin.index];
  if (!out) throw new Error(`Input ${i + 1} refers to a missing previous output.`);
  if (inp.witnessUtxo && (hex(out.script) !== hex(inp.witnessUtxo.script) || out.value !== inp.witnessUtxo.value)) throw new Error("Conflicting input values.");
  return out;
}
function scriptFor(pubkey: Uint8Array, purpose: number, coin: CoinId): Uint8Array | undefined {
  const network = NETWORKS[coin];
  if (coin === "DOGE" && purpose !== 44) return undefined;
  if (purpose === 84) return payments.p2wpkh({ pubkey, network }).output;
  if (purpose === 49) return payments.p2sh({ redeem: payments.p2wpkh({ pubkey, network }), network }).output;
  if (purpose === 44) return payments.p2pkh({ pubkey, network }).output;
  return undefined;
}
type Derivation = { masterFingerprint: Uint8Array; path: string; pubkey: Uint8Array };
interface Owned { seed: SignerSeed; key: HDKey; coin: CoinId; purpose: number }
async function ownerOf(derivs: Derivation[] | undefined, seeds: SignerSeed[], selected: CoinId, roots: Map<string, HDKey>): Promise<Owned | null> {
  for (const d of derivs ?? []) {
    const seed = seeds.find((s) => s.fingerprint.toLowerCase() === hex(d.masterFingerprint));
    const parts = pathParts(d.path);
    if (!seed || !parts) continue;
    const coin = coinFromCoinType(parts.ct, selected);
    if (!coin) continue;
    let root = roots.get(seed.id);
    if (!root) { root = HDKey.fromMasterSeed(await mnemonicToSeed(seed.words, seed.passphrase ?? "")); roots.set(seed.id, root); }
    if (root.fingerprint.toString(16).padStart(8, "0") !== hex(d.masterFingerprint)) continue;
    const key = root.derive(d.path);
    if (key.publicKey && hex(key.publicKey) === hex(d.pubkey)) return { seed, key, coin, purpose: parts.purpose };
  }
  return null;
}

export async function reviewPsbt(psbt: Psbt, seeds: SignerSeed[], selected: CoinId = "TXC"): Promise<{ review: Review; keys: HDKey[] }> {
  approvals.delete(psbt);
  const snapshot = psbt.toBase64();
  if (psbt.inputCount === 0) throw new Error("This payment has no inputs.");
  if (psbt.inputCount > 200 || psbt.txOutputs.length > 200 || !psbt.txOutputs.length) throw new Error("Unsupported payment size.");
  validateDataOutputs(psbt, selected);
  const roots = new Map<string, HDKey>(); // Only lives during this review, never a global secret cache.
  const warnings: string[] = [];
  const keys: HDKey[] = [];
  const purposes: number[] = [];
  const names = new Set<string>();
  let inputsSats = 0n;
  for (let i = 0; i < psbt.inputCount; i++) {
    const inp = psbt.data.inputs[i];
    if (inp.sighashType !== undefined && inp.sighashType !== Transaction.SIGHASH_ALL) throw new Error("Only SIGHASH_ALL payments are allowed.");
    if (inp.partialSig?.length || inp.finalScriptSig || inp.finalScriptWitness) throw new Error("This payment is already partly signed. Start with an unsigned payment.");
    const own = await ownerOf(inp.bip32Derivation, seeds, selected, roots);
    if (!own) throw new Error(`Input ${i + 1} doesn't belong to any seed in this vault.`);
    if (own.coin !== selected) throw new Error("This payment mixes coins or doesn't match the selected network. Refusing to sign.");
    names.add(own.seed.name);
    const pubkey = own.key.publicKey;
    const expected = pubkey ? scriptFor(pubkey, own.purpose, selected) : undefined;
    const prev = previousOutput(psbt, i);
    if (own.purpose === 44 && !prev) throw new Error("Legacy inputs require the full previous transaction to verify the fee.");
    const actual = prev ?? inp.witnessUtxo;
    if (!expected || !actual || hex(expected) !== hex(actual.script)) throw new Error(`Input ${i + 1} isn't an address from your seed.`);
    if (!prev && !warnings.includes("Input amounts are supplied by your online wallet, not independently checked against the blockchain.")) warnings.push("Input amounts are supplied by your online wallet, not independently checked against the blockchain.");
    inputsSats += actual.value;
    keys.push(own.key);
    purposes.push(own.purpose);
  }
  const outputs: ReviewOutput[] = [];
  let sendSats = 0n;
  let changeSats = 0n;
  for (let i = 0; i < psbt.txOutputs.length; i++) {
    const o = psbt.txOutputs[i];
    const isData = o.script[0] === 0x6a;
    let addr = "Data (OP_RETURN)";
    if (!isData) { try { addr = baddress.fromOutputScript(o.script, NETWORKS[selected]); } catch { throw new Error(`Output ${i + 1} isn't a ${selected} address.`); } }
    const own = isData ? null : await ownerOf(psbt.data.outputs[i]?.bip32Derivation, seeds, selected, roots);
    const pubkey = own?.key.publicKey;
    const exp = own && pubkey && own.coin === selected ? scriptFor(pubkey, own.purpose, selected) : undefined;
    const isChange = !!exp && hex(exp) === hex(o.script);
    if (isChange) changeSats += o.value; else sendSats += o.value;
    outputs.push({ address: addr, sats: o.value, isChange, isData });
  }
  const feeSats = inputsSats - sendSats - changeSats;
  if (feeSats < 0n) throw new Error("This payment spends more than its inputs hold.");
  const maximumVsize = maximumSignedVsize(psbt, purposes);
  const feeRateMinimum = feeSats / BigInt(maximumVsize);
  if (feeRateMinimum >= BigInt(MAX_FEE_RATE)) throw feeError(selected, feeSats);
  let token: TokenSend | null = null;
  if (selected === "TXC" || selected === "ISK") for (const o of psbt.txOutputs) {
    const d = o.script[0] === 0x6a ? decodeOmniSimpleSend(o.script) : null;
    if (!d) continue;
    const info = KNOWN_TOKENS[d.propertyId];
    token = { propertyId: d.propertyId, symbol: info?.symbol ?? `Token #${d.propertyId}`, amount: info?.divisible ? formatCoins(d.amount) : d.amount.toString(), to: outputs.find((x) => !x.isData && !x.isChange)?.address ?? null };
    if (!info) warnings.push(`Token #${d.propertyId} isn't one this vault knows, so the amount is shown as raw units.`);
  }
  if (sendSats > 0n && feeSats * 20n > sendSats) warnings.push("The network fee is more than 5% of what you're sending.");
  if (feeSats > 100_000_000n) warnings.push("The network fee is over 1 coin. Check this carefully.");
  if (psbt.toBase64() !== snapshot) throw new Error("The payment changed during review. Scan it again.");
  approvals.set(psbt, { snapshot, keys: [...keys], coin: selected });
  return { review: { coin: selected, seedName: [...names].join(", "), inputsSats, sendSats, changeSats, feeSats, feeRateMinimum, maximumVsize, outputs, token, warnings }, keys };
}

export function signPsbt(psbt: Psbt, keys: HDKey[]): { hex: string; txid: string } {
  const approved = approvals.get(psbt);
  if (!approved || psbt.toBase64() !== approved.snapshot || keys.length !== approved.keys.length || keys.some((k, i) => k !== approved.keys[i])) {
    throw new Error("The payment or signing keys changed, or were not reviewed. Scan the unsigned payment again.");
  }
  if (keys.length !== psbt.inputCount) throw new Error("Missing input signing keys.");
  // Never partially sign/mutate the reviewed object; a failed attempt can safely be retried.
  const signing = Psbt.fromBase64(approved.snapshot, { network: NETWORKS[approved.coin], maximumFeeRate: MAX_FEE_RATE });
  validateDataOutputs(signing, approved.coin);
  keys.forEach((k, i) => {
    const publicKey = k.publicKey;
    if (!publicKey || !k.privateKey) throw new Error("Missing signing key.");
    signing.signInput(i, { publicKey, sign: (hash: Uint8Array) => k.sign(hash) }, [Transaction.SIGHASH_ALL]);
  });
  signing.finalizeAllInputs();
  if (signing.getFeeRate() >= MAX_FEE_RATE) throw feeError(approved.coin, signing.getFee());
  const tx = signing.extractTransaction();
  return { hex: tx.toHex(), txid: tx.getId() };
}
export function formatCoins(sats: bigint): string {
  const neg = sats < 0n, v = neg ? -sats : sats;
  const frac = (v % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${v / 100_000_000n}${frac ? "." + frac : ""}`;
}
