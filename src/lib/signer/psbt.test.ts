import { describe, expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { payments, Psbt, Transaction } from "bitcoinjs-lib";
import { NETWORKS } from "./networks";
import { parsePsbt, reviewPsbt, signPsbt } from "./psbt";
import { PartCollector, toParts } from "./qr-parts";

const WORDS = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OTHER = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
const net = NETWORKS.TXC;

async function setup() {
  const root = HDKey.fromMasterSeed(await mnemonicToSeed(WORDS));
  const fp = root.fingerprint.toString(16).padStart(8, "0");
  const recv = root.derive("m/84'/696969'/0'/0/0");
  const chg = root.derive("m/84'/696969'/0'/1/0");
  const other = HDKey.fromMasterSeed(await mnemonicToSeed(OTHER)).derive("m/84'/696969'/0'/0/0");
  const p2 = (k: HDKey) => payments.p2wpkh({ pubkey: k.publicKey as Buffer, network: net });
  const fpBytes = Uint8Array.from(fp.match(/../g)!.map((h) => parseInt(h, 16)));
  const psbt = new Psbt({ network: net });
  psbt.addInput({
    hash: "11".repeat(32), index: 0,
    witnessUtxo: { script: p2(recv).output!, value: 100_000_000n },
    bip32Derivation: [{ masterFingerprint: fpBytes as Buffer, path: "m/84'/696969'/0'/0/0", pubkey: recv.publicKey as Buffer }],
  });
  psbt.addOutput({ address: p2(other).address!, value: 30_000_000n });
  psbt.addOutput({ address: p2(chg).address!, value: 69_990_000n, bip32Derivation: [{ masterFingerprint: fpBytes as Buffer, path: "m/84'/696969'/0'/1/0", pubkey: chg.publicKey as Buffer }] });
  const seeds = [{ id: "a", name: "Main", words: WORDS, fingerprint: fp }];
  return { psbt, seeds, otherAddr: p2(other).address! };
}

describe("offline signer", () => {
  it("shows what is sent, the change and the fee", async () => {
    const { psbt, seeds, otherAddr } = await setup();
    const { review } = await reviewPsbt(parsePsbt(psbt.toBase64()), seeds);
    expect(review.coin).toBe("TXC");
    expect(review.sendSats).toBe(30_000_000n);
    expect(review.changeSats).toBe(69_990_000n);
    expect(review.feeSats).toBe(10_000n);
    expect(review.outputs[0].address).toBe(otherAddr);
    expect(review.outputs[1].isChange).toBe(true);
  });
  it("signs into a broadcastable transaction", async () => {
    const { psbt, seeds } = await setup();
    const p = parsePsbt(psbt.toBase64());
    const { keys } = await reviewPsbt(p, seeds);
    const { hex, txid } = signPsbt(p, keys);
    expect(Transaction.fromHex(hex).getId()).toBe(txid);
  });
  it("refuses a payment whose inputs belong to no stored seed", async () => {
    const { psbt } = await setup();
    await expect(reviewPsbt(parsePsbt(psbt.toBase64()), [{ id: "b", name: "x", words: OTHER, fingerprint: "deadbeef" }])).rejects.toThrow(/doesn't belong/);
  });
  it("multi-part QR round-trips", () => {
    const text = "x".repeat(1500);
    const parts = toParts(text);
    expect(parts).toHaveLength(3);
    const c = new PartCollector();
    expect(c.add(parts[2])).toBeNull();
    expect(c.add(parts[0])).toBeNull();
    expect(c.add(parts[1])).toBe(text);
  });
});
