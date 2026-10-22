import { describe, expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { payments, Psbt, Transaction } from "bitcoinjs-lib";
import { NETWORKS, type CoinId } from "./networks";
import { MAX_FEE_RATE, reviewPsbt, signPsbt } from "./psbt";

const words = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
async function payment(coin: CoinId = "DOGE", fee = 10_000n) {
  const root = HDKey.fromMasterSeed(await mnemonicToSeed(words));
  const ct = coin === "TXC" ? 696969 : coin === "ISK" ? 969696 : coin === "BTC" ? 0 : coin === "LTC" ? 2 : 3;
  const path = `m/44'/${ct}'/0'/0/0`;
  const key = root.derive(path);
  const destKey = root.derive(`m/44'/${ct}'/1'/0/0`);
  const from = payments.p2pkh({ pubkey: key.publicKey ?? undefined, network: NETWORKS[coin] });
  const to = payments.p2pkh({ pubkey: destKey.publicKey ?? undefined, network: NETWORKS[coin] });
  if (!from.output || !to.address || !key.publicKey) throw new Error("Missing dummy key");
  const prev = new Transaction();
  prev.addInput(new Uint8Array(32), 0xffffffff);
  prev.addOutput(from.output, 100_000_000n);
  // Deliberately permissive caller options must not override Vault policy.
  const psbt = new Psbt({ network: NETWORKS[coin], maximumFeeRate: 10_000_000 });
  psbt.addInput({ hash: prev.getId(), index: 0, nonWitnessUtxo: prev.toBuffer(), bip32Derivation: [{
    masterFingerprint: Uint8Array.from(Buffer.from(root.fingerprint.toString(16).padStart(8, "0"), "hex")), path, pubkey: key.publicKey,
  }] });
  psbt.addOutput({ address: to.address, value: 100_000_000n - fee });
  return { psbt, key, seeds: [{ id: "dummy", name: "Dummy", words, fingerprint: root.fingerprint.toString(16).padStart(8, "0") }] };
}
function dataOutput(psbt: Psbt, payload: Uint8Array, value = 0n) {
  const script = payments.embed({ data: [payload] }).output;
  if (!script) throw new Error("Missing dummy data script");
  psbt.addOutput({ script, value });
}
const omni = Uint8Array.from(Buffer.from("6f6d6e69000000000000002700000002540be400", "hex"));

describe("offline payment safety policy", () => {
  for (const coin of ["TXC", "ISK", "BTC", "LTC", "DOGE"] as const) {
    it(`blocks unreadable ${coin} swap memos before signing`, async () => {
      const { psbt, seeds, key } = await payment(coin);
      dataOutput(psbt, new TextEncoder().encode("=:ETH.USDC:0x1111111111111111111111111111111111111111:1000000"));
      const before = psbt.toBase64();
      await expect(reviewPsbt(psbt, seeds, coin)).rejects.toThrow(/cannot verify/);
      expect(() => signPsbt(psbt, [key])).toThrow(/not reviewed/);
      expect(psbt.toBase64()).toBe(before);
    });
    it(`keeps the explicit ${coin} fee cap despite caller overrides`, async () => {
      const { psbt, seeds } = await payment(coin, 1_584_774n);
      expect(MAX_FEE_RATE).toBe(5_000);
      await expect(reviewPsbt(psbt, seeds, coin)).rejects.toThrow(/safety limit/);
      expect(psbt.data.inputs[0].partialSig).toBeUndefined();
    });
  }
  it("still signs normal DOGE payments without mutating the unsigned request", async () => {
    const { psbt, seeds } = await payment();
    const before = psbt.toBase64();
    const { review, keys } = await reviewPsbt(psbt, seeds, "DOGE");
    expect(review.feeSats).toBe(10_000n);
    const signed = signPsbt(psbt, keys);
    const tx = Transaction.fromHex(signed.hex);
    expect(tx.getId()).toBe(signed.txid);
    expect(tx.ins[0].script.length).toBeGreaterThan(0);
    expect(review.maximumVsize).toBeGreaterThanOrEqual(tx.virtualSize());
    expect(psbt.toBase64()).toBe(before);
    expect(signPsbt(psbt, keys).hex).toBe(signed.hex);
  });
  it("refuses changed payment bytes after review", async () => {
    const { psbt, seeds } = await payment();
    const { keys } = await reviewPsbt(psbt, seeds, "DOGE");
    psbt.addOutput({ script: psbt.txOutputs[0].script, value: 1n });
    expect(() => signPsbt(psbt, keys)).toThrow(/changed/);
    expect(psbt.data.inputs[0].partialSig).toBeUndefined();
  });
  it("refuses changed signing keys after review", async () => {
    const { psbt, seeds } = await payment();
    const { keys } = await reviewPsbt(psbt, seeds, "DOGE");
    const another = HDKey.fromMasterSeed(new Uint8Array(32).fill(42));
    expect(() => signPsbt(psbt, [another])).toThrow(/changed/);
    expect(signPsbt(psbt, keys).hex.length).toBeGreaterThan(0);
  });
  for (const coin of ["TXC", "ISK"] as const) it(`keeps readable ${coin} TSD transfers working`, async () => {
    const { psbt, seeds } = await payment(coin);
    dataOutput(psbt, omni);
    const { review, keys } = await reviewPsbt(psbt, seeds, coin);
    expect(review.token?.amount).toBe("100");
    expect(review.token?.symbol).toBe("TSD");
    expect(Transaction.fromHex(signPsbt(psbt, keys).hex).outs).toHaveLength(2);
  });
  it("blocks multiple Omni instructions", async () => {
    const { psbt, seeds } = await payment("TXC");
    dataOutput(psbt, omni); dataOutput(psbt, omni);
    await expect(reviewPsbt(psbt, seeds, "TXC")).rejects.toThrow(/one zero-value/);
  });
  it("blocks value burned into Omni data", async () => {
    const { psbt, seeds } = await payment("TXC");
    dataOutput(psbt, omni, 1n);
    await expect(reviewPsbt(psbt, seeds, "TXC")).rejects.toThrow(/zero-value/);
  });
  it("blocks Omni-looking data on DOGE", async () => {
    const { psbt, seeds } = await payment();
    dataOutput(psbt, omni);
    await expect(reviewPsbt(psbt, seeds, "DOGE")).rejects.toThrow(/cannot verify/);
  });
  it("checks the exact signed fee and leaves failed attempts retryable", async () => {
    const sample = await payment();
    const { review: size } = await reviewPsbt(sample.psbt, sample.seeds, "DOGE");
    // The lower-bound review permits this; shorter real signatures exceed the cap.
    const { psbt, seeds } = await payment("DOGE", BigInt(size.maximumVsize) * 5_000n - 1n);
    const before = psbt.toBase64();
    const { keys } = await reviewPsbt(psbt, seeds, "DOGE");
    expect(() => signPsbt(psbt, keys)).toThrow(/safety limit/);
    expect(psbt.toBase64()).toBe(before);
    expect(() => signPsbt(psbt, keys)).toThrow(/safety limit/);
  });
});