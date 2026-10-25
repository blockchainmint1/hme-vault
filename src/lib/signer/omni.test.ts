import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { payments, Psbt, Transaction } from "bitcoinjs-lib";
import { decodeOmniSendToMany } from "./omni";
import { maxFeeRate, parsePsbt, reviewPsbt, signPsbt } from "./psbt";

const fixture = readFileSync(
  new URL("./fixtures/txc-multisend.psbt.txt", import.meta.url),
  "utf8",
).trim();
const expected = readFileSync(
  new URL("./fixtures/txc-multisend.signed.txt", import.meta.url),
  "utf8",
).trim();
const seeds = [
  {
    id: "dummy",
    name: "Dummy TXC",
    words: "abandon ".repeat(11) + "about",
    fingerprint: "73c5da0a",
  },
];
function payload(count = 7) {
  const bytes = new Uint8Array(13 + count * 9);
  bytes.set([0x6f, 0x6d, 0x6e, 0x69, 0, 0, 0, 7, 0, 0, 0, 39, count]);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < count; i++) {
    bytes[13 + i * 9] = i;
    view.setBigUint64(14 + i * 9, 10_000_000_000n);
  }
  return bytes;
}
function script(bytes: Uint8Array) {
  const output = payments.embed({ data: [bytes] }).output;
  if (!output) throw new Error("Missing test script");
  return output;
}
function withPayload(bytes: Uint8Array, value = 0n) {
  const original = parsePsbt(fixture);
  const psbt = new Psbt();
  psbt.setVersion(original.version);
  psbt.setLocktime(original.locktime);
  original.txInputs.forEach((input, i) =>
    psbt.addInput({
      hash: input.hash,
      index: input.index,
      sequence: input.sequence,
      ...original.data.inputs[i],
    }),
  );
  original.txOutputs.forEach((o, i) =>
    psbt.addOutput({
      script: i === 7 ? script(bytes) : o.script,
      value: i === 7 ? value : o.value,
      ...original.data.outputs[i],
    }),
  );
  return psbt;
}
describe("TXC Omni Send To Many", () => {
  it("signs the supplied seven-recipient fixture to the exact expected transaction", async () => {
    const psbt = parsePsbt(fixture);
    const before = psbt.toBase64();
    const { review, keys } = await reviewPsbt(psbt, seeds, "TXC");
    expect(review.token?.amount).toBe("700");
    expect(review.token?.symbol).toBe("TSD");
    expect(review.token?.propertyId).toBe(39);
    expect(review.token?.recipients).toEqual(
      psbt.txOutputs.slice(0, 7).map((o, vout) => ({ vout, address: o.address, amount: "100" })),
    );
    expect(review.feeSats).toBe(1000n);
    // Actual fixture differs from README's change figure: 1 TXC - 7×0.0001 - 0.00001.
    expect(review.changeSats).toBe(99_929_000n);
    const signed = signPsbt(psbt, keys);
    expect(signed.hex).toBe(expected);
    expect(signed.txid).toBe("aa960bfea77fc0984529693d29b1b90f9e951ce06af5812f8fe443da239f22fb");
    expect(Transaction.fromHex(signed.hex).virtualSize()).toBe(518);
    expect(psbt.toBase64()).toBe(before);
  });
  it("accepts counts 1 through 7 using canonical push encodings", () => {
    for (let count = 1; count <= 7; count++)
      expect(decodeOmniSendToMany(script(payload(count)))).toHaveLength(count);
  });
  for (const count of [0, 8])
    it(`rejects receiver count ${count}`, () =>
      expect(decodeOmniSendToMany(script(payload(count)))).toBeNull());
  for (const [name, offset, value] of [
    ["duplicate vout", 22, 0],
    ["unsupported property", 11, 40],
    ["unsupported version", 5, 1],
    ["unsupported type", 7, 8],
  ] as const) {
    it(`rejects ${name}`, async () => {
      const bytes = payload();
      bytes[offset] = value;
      expect(decodeOmniSendToMany(script(bytes))).toBeNull();
      const psbt = withPayload(bytes);
      await expect(reviewPsbt(psbt, seeds, "TXC")).rejects.toThrow("cannot verify");
    });
  }
  it("rejects zero token amounts", () => {
    const bytes = payload();
    bytes.fill(0, 14, 22);
    expect(decodeOmniSendToMany(script(bytes))).toBeNull();
  });
  it("rejects truncated, trailing and noncanonical data", () => {
    const good = script(payload());
    expect(decodeOmniSendToMany(good.slice(0, -1))).toBeNull();
    expect(decodeOmniSendToMany(Uint8Array.from([...good, 0]))).toBeNull();
    expect(decodeOmniSendToMany(Uint8Array.from([0x6a, 76, ...payload()]))).toBeNull();
    expect(decodeOmniSendToMany(Uint8Array.from([0x6a, 0x4c, 22, ...payload(1)]))).toBeNull();
  });
  for (const [name, vout] of [
    ["out of range", 255],
    ["data", 7],
    ["change", 8],
  ] as const)
    it(`rejects recipient targeting ${name}`, async () => {
      const bytes = payload();
      bytes[13] = vout;
      const psbt = withPayload(bytes);
      await expect(reviewPsbt(psbt, seeds, "TXC")).rejects.toThrow("recipient points");
      expect(psbt.data.inputs[0].partialSig).toBeUndefined();
    });
  it("rejects nonzero data output value", async () => {
    await expect(reviewPsbt(withPayload(payload(), 1n), seeds, "TXC")).rejects.toThrow(
      "zero-value",
    );
  });
  for (const network of ["BTC", "LTC", "DOGE", "ISK"] as const)
    it(`does not enable type 7 on ${network}`, async () => {
      await expect(reviewPsbt(parsePsbt(fixture, network), seeds, network)).rejects.toThrow(
        "cannot verify",
      );
    });
  it("rejects multiple data instructions", async () => {
    const psbt = parsePsbt(fixture);
    psbt.addOutput({ script: script(payload(1)), value: 0n });
    await expect(reviewPsbt(psbt, seeds, "TXC")).rejects.toThrow("one zero-value");
  });
  it("requires reviewed bytes unchanged before signing", async () => {
    const psbt = parsePsbt(fixture);
    const { keys } = await reviewPsbt(psbt, seeds, "TXC");
    psbt.addOutput({ script: psbt.txOutputs[0].script, value: 1n });
    expect(() => signPsbt(psbt, keys)).toThrow("changed");
  });
  it("keeps the TXC fee cap for multi-send despite permissive caller options", async () => {
    const psbt = parsePsbt(fixture);
    const { review } = await reviewPsbt(psbt, seeds, "TXC");
    const original = parsePsbt(fixture);
    const expensive = new Psbt({ maximumFeeRate: 10_000_000 });
    expensive.setVersion(original.version);
    original.txInputs.forEach((input, i) => expensive.addInput({ hash: input.hash, index: input.index, sequence: input.sequence, ...original.data.inputs[i] }));
    original.txOutputs.forEach((o, i) => expensive.addOutput({ script: o.script, value: i === 8 ? o.value - BigInt(review.maximumVsize * maxFeeRate("TXC")) : o.value, ...original.data.outputs[i] }));
    await expect(reviewPsbt(expensive, seeds, "TXC")).rejects.toThrow("safety limit");
  });
});
