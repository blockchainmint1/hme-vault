import { describe, expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { payments, Psbt, Transaction } from "bitcoinjs-lib";
import { NETWORKS, coinFromCoinType, type CoinId } from "./networks";
import { parsePsbt, reviewPsbt, signPsbt } from "./psbt";
import { pairingPayload } from "../vault/seeds";
const WORDS =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
export async function fixture(
  coin: CoinId,
  purpose = 44,
  ct = { TXC: 696969, ISK: 969696, BTC: 0, LTC: 2, DOGE: 3 }[coin],
) {
  const root = HDKey.fromMasterSeed(await mnemonicToSeed(WORDS));
  const path = `m/${purpose}'/${ct}'/0'/0/0`,
    changePath = `m/${purpose}'/${ct}'/0'/1/0`;
  const key = root.derive(path),
    change = root.derive(changePath);
  const fp = root.fingerprint.toString(16).padStart(8, "0");
  const pub = (k: HDKey) => {
    if (!k.publicKey) throw new Error("test key missing");
    return k.publicKey;
  };
  const pay = (k: HDKey) =>
    purpose === 44
      ? payments.p2pkh({ pubkey: pub(k), network: NETWORKS[coin] })
      : purpose === 84
        ? payments.p2wpkh({ pubkey: pub(k), network: NETWORKS[coin] })
        : payments.p2sh({
            redeem: payments.p2wpkh({ pubkey: pub(k), network: NETWORKS[coin] }),
            network: NETWORKS[coin],
          });
  const recv = pay(key),
    chg = pay(change),
    dest = pay(root.derive(`m/${purpose}'/${ct}'/1'/0/0`));
  if (!recv.output || !dest.address || !chg.address) throw new Error("test payment missing");
  const prev = new Transaction();
  prev.addInput(new Uint8Array(32), 0xffffffff);
  prev.addOutput(recv.output, 100_000_000n);
  const deriv = (k: HDKey, p: string) => [
    { masterFingerprint: Uint8Array.from(Buffer.from(fp, "hex")), path: p, pubkey: pub(k) },
  ];
  const psbt = new Psbt({ network: NETWORKS[coin] });
  psbt.addInput({
    hash: prev.getId(),
    index: 0,
    ...(purpose === 44
      ? { nonWitnessUtxo: prev.toBuffer() }
      : { witnessUtxo: { script: recv.output, value: 100_000_000n } }),
    ...(purpose === 49 && recv.redeem?.output ? { redeemScript: recv.redeem.output } : {}),
    bip32Derivation: deriv(key, path),
  });
  psbt.addOutput({ address: dest.address, value: 30_000_000n });
  psbt.addOutput({
    address: chg.address,
    value: 69_990_000n,
    bip32Derivation: deriv(change, changePath),
  });
  return {
    psbt,
    seeds: [{ id: `test-${coin}-${purpose}`, name: "Dummy", words: WORDS, fingerprint: fp }],
    destination: dest.address,
  };
}

describe("multi-chain offline PSBT signing", () => {
  for (const coin of ["BTC", "LTC", "DOGE", "ISK"] as const) {
    for (const purpose of coin === "DOGE" ? [44] : [44, 49, 84])
      it(`${coin} purpose ${purpose} reviews and signs`, async () => {
        const { psbt, seeds, destination } = await fixture(coin, purpose);
        const p = parsePsbt(psbt.toBase64(), coin);
        const { review, keys } = await reviewPsbt(p, seeds, coin);
        expect(review.coin).toBe(coin);
        expect(review.outputs[0].address).toBe(destination);
        expect(review.changeSats).toBe(69_990_000n);
        expect(review.feeSats).toBe(10_000n);
        const signed = signPsbt(p, keys);
        const tx = Transaction.fromHex(signed.hex);
        expect(tx.getId()).toBe(signed.txid);
        expect(tx.ins[0].script.length + tx.ins[0].witness.length).toBeGreaterThan(0);
      });
  }
  it("coin-0 defaults to BTC but preserves explicit legacy TXC", async () => {
    expect(coinFromCoinType(0)).toBe("BTC");
    expect(coinFromCoinType(0, "TXC")).toBe("TXC");
    const { psbt, seeds } = await fixture("TXC", 44, 0);
    expect((await reviewPsbt(parsePsbt(psbt.toBase64(), "TXC"), seeds, "TXC")).review.coin).toBe(
      "TXC",
    );
  });
  it("refuses coin-path mismatch", async () => {
    const { psbt, seeds } = await fixture("LTC", 84);
    await expect(reviewPsbt(parsePsbt(psbt.toBase64(), "BTC"), seeds, "BTC")).rejects.toThrow(
      /selected network/,
    );
  });
  it("refuses legacy witness-only values", async () => {
    const { psbt, seeds } = await fixture("DOGE");
    const inp = psbt.data.inputs[0];
    const prev = Transaction.fromBuffer(inp.nonWitnessUtxo ?? new Uint8Array());
    const witnessOnly = new Psbt({ network: NETWORKS.DOGE });
    witnessOnly.addInput({
      hash: prev.getId(),
      index: 0,
      witnessUtxo: prev.outs[0],
      bip32Derivation: inp.bip32Derivation,
    });
    for (const out of psbt.txOutputs)
      witnessOnly.addOutput({ script: out.script, value: out.value });
    await expect(reviewPsbt(witnessOnly, seeds, "DOGE")).rejects.toThrow(/full previous/);
  });
  it("refuses changed previous transaction", async () => {
    const { psbt, seeds } = await fixture("BTC");
    const prev = Transaction.fromBuffer(psbt.data.inputs[0].nonWitnessUtxo ?? new Uint8Array());
    prev.outs[0].value = 99_000_000n;
    psbt.data.inputs[0].nonWitnessUtxo = prev.toBuffer();
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/wrong previous/);
  });
  it("refuses SIGHASH_NONE", async () => {
    const { psbt, seeds } = await fixture("BTC", 84);
    psbt.updateInput(0, { sighashType: Transaction.SIGHASH_NONE });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/SIGHASH_ALL/);
  });
  it("does not trust a forged change derivation", async () => {
    const { psbt, seeds } = await fixture("LTC", 84);
    const d = psbt.data.outputs[1].bip32Derivation?.[0];
    if (!d) throw new Error("missing derivation");
    d.path = "m/84'/2'/0'/1/1";
    const { review } = await reviewPsbt(psbt, seeds, "LTC");
    expect(review.changeSats).toBe(0n);
    expect(review.sendSats).toBe(99_990_000n);
  });
  it("pairing includes BTC LTC DOGE and EVM without private keys", async () => {
    const pair = JSON.parse(await pairingPayload(WORDS));
    const root = HDKey.fromMasterSeed(await mnemonicToSeed(WORDS));
    expect(pair.btc[84]).toBe(root.derive("m/84'/0'/0'").publicExtendedKey);
    expect(pair.ltc[49]).toBe(root.derive("m/49'/2'/0'").publicExtendedKey);
    expect(pair.doge[44]).toBe(root.derive("m/44'/3'/0'").publicExtendedKey);
    expect(pair.doge[84]).toBeUndefined();
    expect(pair.evm.address).toBe("0x9858effd232b4033e47d90003d41ec34ecaeda94");
    expect(JSON.stringify(pair)).not.toContain("xprv");
  });
});
