import { describe, expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import {
  bytesToHex,
  decodeFunctionData,
  keccak256,
  parseAbi,
  parseTransaction,
  recoverTransactionAddress,
  stringToBytes,
  type TransactionSerialized,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseSweep, reviewSweep, signSweep, SWEEP_TOKENS } from "./sweep";
import { getAddress } from "viem";

const words =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const seeds = [{ id: "d", name: "Dummy", words, fingerprint: "73c5da0a" }];
const branch = HDKey.fromMasterSeed(mnemonicToSeedSync(words)).derive("m/44'/60'/0'/0");
const addr = (i: number) =>
  privateKeyToAccount(bytesToHex(branch.deriveChild(i).privateKey!)).address;
const DEST = "0x1111111111111111111111111111111111111111";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const fees = { type: "eip1559", maxFeePerGas: "30000000000", maxPriorityFeePerGas: "1000000000" };
const token = (i: number, nonce: number, to = DEST) => ({
  kind: "erc20-transfer",
  path: `m/44'/60'/0'/0/${i}`,
  from: addr(i),
  to,
  token: USDC,
  amount: "2500000",
  nonce,
  gas: "65000",
  ...fees,
});
const native = (i: number, nonce: number) => ({
  kind: "native-transfer",
  path: `m/44'/60'/0'/0/${i}`,
  from: addr(i),
  to: DEST,
  value: "41000000000000",
  nonce,
  gas: "21000",
  ...fees,
});
const req = (items: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: "hm-evm-tx",
    v: 1,
    kind: "sweep-batch",
    fp: "73c5da0a",
    chainId: 1,
    destination: DEST,
    items,
    ...extra,
  });
const ok = [token(3, 0), native(3, 1), native(4, 9)];

describe("batch sweep validation", () => {
  it("accepts a valid batch", () => expect(parseSweep(req(ok)).items).toHaveLength(3));
  const bad: [string, string][] = [
    [
      "ERC-20 item whose to is not the destination",
      req([token(3, 0, "0x2222222222222222222222222222222222222222")]),
    ],
    [
      "mixed destinations (native)",
      req([{ ...native(3, 0), to: "0x2222222222222222222222222222222222222222" }]),
    ],
    ["path out of range", req([{ ...native(3, 0), path: "m/44'/60'/0'/0/1000" }])],
    ["non-standard account path", req([{ ...native(3, 0), path: "m/44'/60'/1'/0/3" }])],
    ["duplicate nonce", req([token(3, 0), native(3, 0)])],
    ["non-consecutive nonce", req([token(3, 0), native(3, 2)])],
    ["native before token", req([native(3, 0), token(3, 1)])],
    ["same asset twice", req([token(3, 0), token(3, 1)])],
    ["self-send", req([native(3, 0)], { destination: addr(3) })],
    ["more than 25 items", req(Array.from({ length: 26 }, (_, i) => native(i, 0)))],
    ["empty batch", req([])],
    ["unknown envelope key", req(ok, { extra: 1 })],
    ["unknown item key", req([{ ...native(3, 0), data: "0x" }])],
    ["item repeats fp", req([{ ...native(3, 0), fp: "00000000" }])],
    ["mixed chain in item", req([{ ...native(3, 0), chainId: 56 }])],
    ["unsupported chain", req(ok, { chainId: 10 })],
    ["native gas not 21000", req([{ ...native(3, 0), gas: "30000" }])],
    ["token gas too high", req([{ ...token(3, 0), gas: "500000" }])],
    ["fee over single ceiling", req([{ ...native(3, 0), maxFeePerGas: "2000000000000" }])],
    [
      "disperse inside a batch",
      req([{ ...native(3, 0), kind: "native-disperse", recipients: [DEST], values: ["1"] }]),
    ],
  ];
  for (const [name, text] of bad)
    it(`refuses ${name}`, () => expect(() => parseSweep(text)).toThrow());
  it("refuses a sender that isn't the derived address", async () => {
    await expect(reviewSweep(req([{ ...native(3, 0), from: addr(5) }]), seeds)).rejects.toThrow();
  });
  it("refuses mixed seeds (fingerprint)", async () => {
    await expect(reviewSweep(req(ok, { fp: "deadbeef" }), seeds)).rejects.toThrow();
  });
  it("pins curated tokens with valid checksums", () => {
    for (const t of SWEEP_TOKENS) expect(getAddress(t.contract)).toBe(t.contract);
  });
});

describe("batch sweep review and signing", () => {
  it("labels own vs external destination and unknown tokens", async () => {
    const ext = await reviewSweep(req(ok), seeds);
    expect(ext.ownIndex).toBeNull();
    expect(ext.totals.find((t) => t.asset.startsWith("USDC"))?.amountLabel).toBe("2.5 USDC");
    const own = await reviewSweep(
      req([native(3, 0)], { destination: addr(7) }).replace(DEST, addr(7)),
      seeds,
    );
    expect(own.ownIndex).toBe(7);
    const unk = await reviewSweep(
      req([{ ...token(3, 0), token: "0x3333333333333333333333333333333333333333" }]),
      seeds,
    );
    expect(unk.rows[0].unknownToken).toBe(true);
  });
  it("signs a full 25-item batch bound to the exact request bytes", async () => {
    const items = Array.from({ length: 25 }, (_, i) => native(i, i));
    const text = req(items);
    const reply = JSON.parse(await signSweep(await reviewSweep(text, seeds), seeds));
    expect(reply.format).toBe("hm-evm-signed-batch");
    expect(reply.intentHash).toBe(keccak256(stringToBytes(text)));
    expect(reply.signed).toHaveLength(25);
    for (let i = 0; i < 25; i++) {
      const hex = bytesToHex(Uint8Array.from(atob(reply.signed[i]), (c) => c.charCodeAt(0)));
      const tx = parseTransaction(hex);
      expect(tx.nonce).toBe(i);
      expect(tx.chainId).toBe(1);
      expect(tx.to?.toLowerCase()).toBe(DEST);
      expect(
        await recoverTransactionAddress({ serializedTransaction: hex as TransactionSerialized }),
      ).toBe(addr(i));
    }
  });
  it("rebuilds token calldata paying the destination", async () => {
    const reply = JSON.parse(await signSweep(await reviewSweep(req([token(3, 0)]), seeds), seeds));
    const hex = bytesToHex(Uint8Array.from(atob(reply.signed[0]), (c) => c.charCodeAt(0)));
    const tx = parseTransaction(hex);
    expect(tx.to).toBe(USDC.toLowerCase());
    const d = decodeFunctionData({
      abi: parseAbi(["function transfer(address,uint256)"]),
      data: tx.data!,
    });
    expect(d.args).toEqual([getAddress(DEST), 2500000n]);
  });
  it("refuses a total fee over the batch ceiling", async () => {
    const hot = { maxFeePerGas: "900000000000", maxPriorityFeePerGas: "1" };
    const items = Array.from({ length: 6 }, (_, i) => ({ ...native(i, 0), ...hot }));
    await expect(reviewSweep(req(items), seeds)).rejects.toThrow(/batch limit/);
  });
});
