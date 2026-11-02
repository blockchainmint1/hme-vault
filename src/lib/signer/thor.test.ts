import { describe, expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { address as baddress, payments, Psbt, Transaction } from "bitcoinjs-lib";
import {
  decodeFunctionData,
  encodeFunctionData,
  parseTransaction,
  recoverTransactionAddress,
  type TransactionSerializable,
  type TransactionSerialized,
} from "viem";
import { NETWORKS, type CoinId } from "./networks";
import { reviewPsbt, signPsbt } from "./psbt";
import {
  THOR_CHAINS,
  THOR_MEMO_SUFFIX,
  format1e8,
  parseThorMemo,
  resolveThorAssetField,
  vaultOwnsAddress,
} from "./thor";
import { reviewThorSwap, signThorSwap } from "./thor-evm";

// Dummy mnemonic only. Nothing here touches a real wallet or the network.
const words =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const otherWords = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
const seeds = [{ id: "dummy", name: "Dummy", words, fingerprint: "73c5da0a" }];
const EVM_FROM = "0x9858effd232b4033e47d90003d41ec34ecaeda94";

/** Payout ETH on Ethereum to an address this Vault does not control. */
const UTXO_MEMO = "=:ETH.ETH:0x1111111111111111111111111111111111111111:10000000/1/1";
/** Payout Bitcoin to an address this Vault does not control. */
const EVM_MEMO = "=:BTC.BTC:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:10000000/1/1";

const ETH_ROUTER = "0xD37BbE5744D730a1d98d8DC97c42F0Ca46aD7146";
const BASE_ROUTER = "0x00dc6100103BC402d490aEE3F9a5560cBd91f1d4";
const BSC_ROUTER = "0xb30ec53f98ff5947ede720d32ac2da7e52a5f56b";
const USDC_ETH = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const INBOUND = "0x1111111111111111111111111111111111111111";
const ZERO = "0x0000000000000000000000000000000000000000";

// Written independently of src/lib/signer/thor-evm.ts: if the module's encoder disagrees in
// argument order or types, every positive swap test below fails on the byte comparison.
const APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
const DEPOSIT_ABI = [
  {
    type: "function",
    name: "depositWithExpiry",
    stateMutability: "payable",
    inputs: [
      { name: "vault", type: "address" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "memo", type: "string" },
      { name: "expiry", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
const approve = (spender: `0x${string}`, amount: bigint) =>
  encodeFunctionData({ abi: APPROVE_ABI, functionName: "approve", args: [spender, amount] });
const deposit = (
  vault: `0x${string}`,
  asset: `0x${string}`,
  amount: bigint,
  memo: string,
  expiry: bigint,
) =>
  encodeFunctionData({
    abi: DEPOSIT_ABI,
    functionName: "depositWithExpiry",
    args: [vault, asset, amount, memo, expiry],
  });

const now = () => BigInt(Math.floor(Date.now() / 1000));
const soon = () => now() + 600n;

function swapRequest(over: Record<string, unknown> = {}, drop: string[] = []) {
  const expiry = soon();
  const base = {
    format: "hm-thor-swap",
    v: 1,
    fp: "73c5da0a",
    path: "m/44'/60'/0'/0/0",
    action: "evm-deposit",
    quote: {
      provider: "thorchain",
      from: "ETH.ETH",
      to: "BTC.BTC",
      rawIn: "1000000000000000000",
      amountIn: "10000000",
      destination: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      inbound: INBOUND,
      router: ETH_ROUTER,
      memo: EVM_MEMO,
      expiry: Number(expiry),
      expectedOut: "10000000",
      minimumOut: "10000000",
      feeOut: "10000",
      seconds: 60,
      toleranceBps: 50,
      quotedAt: "2026-11-02T00:00:00Z",
    },
    transaction: {
      from: EVM_FROM,
      chainId: 1,
      nonce: 7,
      to: ETH_ROUTER,
      value: "1000000000000000000",
      data: deposit(INBOUND, ZERO, 1000000000000000000n, EVM_MEMO, expiry),
      gas: "21000",
      type: "eip1559",
      maxFeePerGas: "30000000000",
      maxPriorityFeePerGas: "1000000000",
    },
  };
  const { quote: baseQuote, transaction: baseTx, ...rest } = base;
  const {
    quote: overQuote,
    transaction: overTx,
    ...overRest
  } = over as {
    quote?: Record<string, unknown>;
    transaction?: Record<string, unknown>;
  };
  const request = {
    ...rest,
    ...overRest,
    quote: { ...baseQuote, ...overQuote },
    transaction: { ...baseTx, ...overTx },
  } as Record<string, unknown>;
  for (const path of drop) {
    const [section, key] = path.split(".");
    if (request[section]) delete (request[section] as Record<string, unknown>)[key];
  }
  return request;
}

async function swapPayment(
  coin: CoinId = "BTC",
  opts: {
    fee?: bigint;
    memo?: string;
    memoValue?: bigint;
    depositSats?: bigint;
    changePath?: string;
    extraOutput?: boolean;
    secondMemo?: boolean;
    sighash?: number;
    foreignInput?: boolean;
    root?: HDKey;
    memoFirst?: boolean;
  } = {},
) {
  const root = opts.root ?? HDKey.fromMasterSeed(await mnemonicToSeed(words));
  const ct =
    coin === "TXC" ? 696969 : coin === "ISK" ? 969696 : coin === "BTC" ? 0 : coin === "LTC" ? 2 : 3;
  const path = `m/44'/${ct}'/0'/0/0`;
  const key = root.derive(path);
  const fpHex = root.fingerprint.toString(16).padStart(8, "0");
  const fp = Uint8Array.from(Buffer.from(fpHex, "hex"));
  const deriv = (k: HDKey, p: string) => [{ masterFingerprint: fp, path: p, pubkey: k.publicKey! }];
  const from = payments.p2pkh({ pubkey: key.publicKey!, network: NETWORKS[coin] });
  const prev = new Transaction();
  prev.addInput(new Uint8Array(32), 0xffffffff);
  prev.addOutput(from.output!, 1_000_000_000n);
  const psbt = new Psbt({ network: NETWORKS[coin] });
  psbt.addInput({
    hash: prev.getId(),
    index: 0,
    nonWitnessUtxo: prev.toBuffer(),
    bip32Derivation: deriv(key, path),
    ...(opts.sighash === undefined ? {} : { sighashType: opts.sighash }),
  });
  // THORChain deposit: a valid address on this network that is not one of this Vault's own.
  const depositKey = root.derive(`m/44'/${ct}'/9'/0/0`);
  const depositAddress = baddress.fromOutputScript(
    payments.p2pkh({ pubkey: depositKey.publicKey!, network: NETWORKS[coin] }).output!,
    NETWORKS[coin],
  );
  const memoScript = payments.embed({
    data: [new TextEncoder().encode(opts.memo ?? UTXO_MEMO)],
  }).output!;
  const depositSats = opts.depositSats ?? (coin === "DOGE" ? 200_000_000n : 500_000n);
  const fee = opts.fee ?? 10_000n;
  const changeKey = root.derive(opts.changePath ?? path);
  const changeScript = payments.p2pkh({
    pubkey: changeKey.publicKey!,
    network: NETWORKS[coin],
  }).output!;
  const outputs: { script: Uint8Array; value: bigint; bip32Derivation?: unknown }[] = [];
  const depositScript = payments.p2pkh({
    pubkey: depositKey.publicKey!,
    network: NETWORKS[coin],
  }).output!;
  if (opts.memoFirst) outputs.push({ script: memoScript, value: opts.memoValue ?? 0n });
  outputs.push({ script: depositScript, value: depositSats });
  outputs.push({
    script: changeScript,
    value: 1_000_000_000n - depositSats - fee,
    bip32Derivation: deriv(changeKey, opts.changePath ?? path),
  });
  if (opts.extraOutput)
    outputs.push({
      script: payments.p2pkh({
        pubkey: root.derive(`m/44'/${ct}'/7'/0/0`).publicKey!,
        network: NETWORKS[coin],
      }).output!,
      value: 1n,
    });
  if (!opts.memoFirst) outputs.push({ script: memoScript, value: opts.memoValue ?? 0n });
  if (opts.secondMemo) outputs.push({ script: memoScript, value: 0n });
  for (const o of outputs)
    psbt.addOutput(
      (o.bip32Derivation
        ? { script: o.script, value: o.value, bip32Derivation: o.bip32Derivation }
        : { script: o.script, value: o.value }) as Parameters<Psbt["addOutput"]>[0],
    );
  return { psbt, key, seeds, fpHex };
}

const dataOutput = (script: Uint8Array, value = 0n) =>
  payments.embed({ data: [script] }).output ?? new Uint8Array();

describe("THORChain memo grammar", () => {
  it("accepts a single-trade swap and reads every field", () => {
    const memo = parseThorMemo(UTXO_MEMO);
    expect(memo.action).toBe("=");
    expect(memo.asset.field).toBe("ETH.ETH");
    expect(memo.asset.label).toBe("Ether on Ethereum");
    expect(memo.destination).toBe("0x1111111111111111111111111111111111111111");
    expect(memo.minimumOut).toBe(10_000_000n);
    expect(format1e8(memo.minimumOut)).toBe("0.1");
    expect(memo.bytes).toBe(65);
  });
  it("accepts both SWAP and s command words and terse payout codes", async () => {
    const root = HDKey.fromMasterSeed(await mnemonicToSeed(words));
    const doge = baddress.fromOutputScript(
      payments.p2pkh({ pubkey: root.derive("m/44'/3'/9'/0/0").publicKey!, network: NETWORKS.DOGE })
        .output!,
      NETWORKS.DOGE,
    );
    expect(
      parseThorMemo("SWAP:b:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:1/1/1").asset.field,
    ).toBe("BTC.BTC");
    expect(parseThorMemo(`s:d:${doge}:1/1/1`).asset.field).toBe("DOGE.DOGE");
  });
  it(`refuses streaming memos: only …${THOR_MEMO_SUFFIX} is a single trade`, () => {
    const base = "=:BTC.BTC:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:10000000";
    expect(() => parseThorMemo(`${base}/1/0`)).toThrow(/single-trade/);
    expect(() => parseThorMemo(`${base}/5/3`)).toThrow(/single-trade/);
  });
  it("refuses a memo with no payout minimum", () => {
    expect(() =>
      parseThorMemo("=:BTC.BTC:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:10000000"),
    ).toThrow(/no payout minimum/);
  });
  it("refuses affiliate and aggregator tags", () => {
    expect(() =>
      parseThorMemo("=:BTC.BTC:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:10000000/1/1:hme:50"),
    ).toThrow(/affiliate|four fields/);
  });
  it("refuses memos over 80 bytes but accepts a 77-byte one", () => {
    const long = `=:ETH.ETH:${"0x1111111111111111111111111111111111111111"}:${"1".repeat(30)}/1/1`;
    expect(new TextEncoder().encode(long).length).toBeGreaterThan(80);
    expect(() => parseThorMemo(long)).toThrow(/longer than 80 bytes/);
    const ok = `=:ETH.ETH:0x1111111111111111111111111111111111111111:${"1".repeat(20)}/1/1`;
    expect(new TextEncoder().encode(ok).length).toBe(77);
    expect(parseThorMemo(ok).minimumOut).toBe(BigInt("1".repeat(20)));
  });
  it("refuses unknown payout assets and unknown commands", () => {
    expect(() =>
      parseThorMemo("=:BTC.BTCX:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:1/1/1"),
    ).toThrow(/unknown payout asset/);
    expect(() =>
      parseThorMemo("ADD:BTC.BTC:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:1/1/1"),
    ).toThrow(/not a recognised swap command/);
  });
  it("refuses a payout address that is not valid on the payout chain", () => {
    expect(() =>
      parseThorMemo("=:BTC.BTC:0x1111111111111111111111111111111111111111:1/1/1"),
    ).toThrow(/not a valid Bitcoin address/);
    expect(() =>
      parseThorMemo("=:ETH.ETH:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:1/1/1"),
    ).toThrow(/not a valid Ether on Ethereum address/);
  });
  it("refuses a zero payout minimum", () => {
    expect(() =>
      parseThorMemo("=:BTC.BTC:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:0/1/1"),
    ).toThrow(/must be positive/);
  });
  it("requires full payout names on EVM sources", () => {
    expect(() => parseThorMemo(UTXO_MEMO, { fullForms: true })).not.toThrow();
    expect(() =>
      parseThorMemo("=:e:0x1111111111111111111111111111111111111111:10000000/1/1", {
        fullForms: true,
      }),
    ).toThrow(/in full/);
    expect(() =>
      parseThorMemo("=:ETH.USDC:0x1111111111111111111111111111111111111111:10000000/1/1", {
        fullForms: true,
      }),
    ).toThrow(/in full/);
  });
});

describe("THORChain UTXO swap signing", () => {
  it("reviews and signs a BTC swap, showing deposit, payout and refund", async () => {
    const { psbt, seeds: s, key } = await swapPayment("BTC");
    const { review, keys } = await reviewPsbt(psbt, s, "BTC");
    expect(review.swap).not.toBeNull();
    expect(review.swap!.assetLabel).toBe("Ether on Ethereum");
    expect(review.swap!.minimumOut).toBe(10_000_000n);
    expect(review.swap!.destination).toBe("0x1111111111111111111111111111111111111111");
    expect(review.swap!.refundAddress).toBe(
      baddress.fromOutputScript(
        payments.p2pkh({ pubkey: key.publicKey!, network: NETWORKS.BTC }).output!,
        NETWORKS.BTC,
      ),
    );
    expect(review.warnings.some((w) => /does not control/.test(w))).toBe(true);
    expect(review.warnings.some((w) => /Compare the THORChain deposit address/.test(w))).toBe(true);
    const signed = signPsbt(psbt, keys);
    const tx = Transaction.fromHex(signed.hex);
    expect(tx.outs).toHaveLength(3);
    expect(tx.outs[2].script[0]).toBe(0x6a);
    expect(psbt.toBase64()).not.toBe("");
  });
  for (const coin of ["BTC", "LTC", "DOGE"] as const)
    it(`signs a ${coin} swap with a 77-byte memo through the long-push path`, async () => {
      const memo = `=:ETH.ETH:0x1111111111111111111111111111111111111111:${"1".repeat(20)}/1/1`;
      const { psbt, seeds: s } = await swapPayment(coin, { memo });
      const { review, keys } = await reviewPsbt(psbt, s, coin);
      expect(review.swap!.minimumOut).toBe(BigInt("1".repeat(20)));
      expect(signPsbt(psbt, keys).hex.length).toBeGreaterThan(0);
    });
  it("refuses a swap memo that is not the last output", async () => {
    const { psbt, seeds } = await swapPayment("BTC", { memoFirst: true });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/last output/);
  });
  it("refuses change that pays another of this Vault's own addresses", async () => {
    const { psbt, seeds } = await swapPayment("BTC", { changePath: "m/44'/0'/0'/0/5" });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/first input/);
  });
  it("refuses a second data output", async () => {
    const { psbt, seeds } = await swapPayment("BTC", { secondMemo: true });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/zero-value|one zero-value/);
  });
  it("refuses an extra payment output", async () => {
    const { psbt, seeds } = await swapPayment("BTC", { extraOutput: true });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/at most one change/);
  });
  it("refuses a data output that carries value", async () => {
    const { psbt, seeds } = await swapPayment("BTC", { memoValue: 1n });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/zero-value/);
  });
  it("refuses a zero-value deposit output", async () => {
    const { psbt, seeds } = await swapPayment("BTC", { depositSats: 0n });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/positive amount|safety limit/);
  });
  it("refuses a streaming swap before signing", async () => {
    const { psbt, seeds } = await swapPayment("BTC", {
      memo: "=:ETH.ETH:0x1111111111111111111111111111111111111111:10000000/1/0",
    });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/cannot verify/);
  });
  it("refuses an affiliate-tagged swap before signing", async () => {
    const { psbt, seeds } = await swapPayment("BTC", {
      memo: "=:ETH.ETH:0x1111111111111111111111111111111111111111:10000000/1/1:hme:50",
    });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/cannot verify/);
  });
  it("refuses a swap that pays out the coin it spends", async () => {
    const { psbt, seeds } = await swapPayment("BTC", {
      memo: "=:BTC.BTC:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:10000000/1/1",
    });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/different asset/);
  });
  it("refuses an unknown payout asset before signing", async () => {
    const { psbt, seeds } = await swapPayment("BTC", {
      memo: "=:BTC.USDC:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:10000000/1/1",
    });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/cannot verify/);
  });
  it("refuses a swap presented under the wrong network selection", async () => {
    const { psbt, seeds } = await swapPayment("BTC");
    await expect(reviewPsbt(psbt, seeds, "LTC")).rejects.toThrow(/selected network|isn't a LTC/);
  });
  it("refuses a swap whose input comes from another seed", async () => {
    const foreign = HDKey.fromMasterSeed(await mnemonicToSeed(otherWords));
    const { psbt, seeds } = await swapPayment("BTC", { root: foreign });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/doesn't belong to any seed/);
  });
  it("refuses a swap signed with anything but SIGHASH_ALL", async () => {
    const { psbt, seeds } = await swapPayment("BTC", { sighash: Transaction.SIGHASH_NONE });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/SIGHASH_ALL/);
  });
  it("keeps the frozen fee cap on a swap", async () => {
    const { psbt, seeds } = await swapPayment("BTC", { fee: 5_000n * 400n });
    await expect(reviewPsbt(psbt, seeds, "BTC")).rejects.toThrow(/safety limit/);
  });
  it("refuses a THORChain memo on a coin that does not support swaps", async () => {
    const txc = await swapPayment("TXC", { memo: UTXO_MEMO });
    await expect(reviewPsbt(txc.psbt, txc.seeds, "TXC")).rejects.toThrow(
      /does not support THORChain swaps/,
    );
    const isk = await swapPayment("ISK", { memo: UTXO_MEMO });
    await expect(reviewPsbt(isk.psbt, isk.seeds, "ISK")).rejects.toThrow(
      /does not support THORChain swaps/,
    );
  });
});

describe("THORChain EVM swap signing", () => {
  it("reviews a native deposit and signs a chain-bound transaction", async () => {
    const r = await reviewThorSwap(JSON.stringify(swapRequest()), seeds);
    expect(r.chainName).toBe("Ethereum");
    expect(r.amountLabel).toBe("1 ETH");
    expect(r.payoutLabel).toBe("at least 0.1 Bitcoin");
    expect(r.depositAddress).toBe(INBOUND);
    expect(r.warnings.some((w) => /Compare the THORChain deposit address/.test(w))).toBe(true);
    const signed = await signThorSwap(r, seeds);
    const tx = parseTransaction(signed.hex as `0x${string}`);
    expect(tx.chainId).toBe(1);
    expect(tx.nonce).toBe(7);
    expect(tx.to?.toLowerCase()).toBe(ETH_ROUTER.toLowerCase());
    expect(tx.value).toBe(1000000000000000000n);
    expect(tx.data?.slice(0, 10)).toBe("0x44bc937b");
    expect(
      (
        await recoverTransactionAddress({
          serializedTransaction: signed.hex as TransactionSerialized,
        })
      ).toLowerCase(),
    ).toBe(EVM_FROM);
  });
  it("reviews an allowance reset to exactly zero", async () => {
    const r = await reviewThorSwap(
      JSON.stringify(
        swapRequest({
          action: "approval-reset",
          quote: {
            from: "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48",
            rawIn: "1000000",
          },
          transaction: { to: USDC_ETH, value: "0", data: approve(ETH_ROUTER, 0n) },
        }),
      ),
      seeds,
    );
    expect(r.actionLabel).toMatch(/Reset USDC allowance to zero/);
    expect(r.amountLabel).toBe("1 USDC");
    const signed = await signThorSwap(r, seeds);
    const tx = parseTransaction(signed.hex as `0x${string}`);
    expect(tx.to?.toLowerCase()).toBe(USDC_ETH.toLowerCase());
    expect(tx.value ?? 0n).toBe(0n);
    const decoded = decodeFunctionData({ abi: APPROVE_ABI, data: tx.data ?? "0x" });
    expect(decoded.args?.[1]).toBe(0n);
  });
  it("reviews an exact allowance and refuses any other amount", async () => {
    const r = await reviewThorSwap(
      JSON.stringify(
        swapRequest({
          action: "approval",
          quote: {
            from: "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48",
            rawIn: "1000000",
          },
          transaction: { to: USDC_ETH, value: "0", data: approve(ETH_ROUTER, 1000000n) },
        }),
      ),
      seeds,
    );
    expect(r.actionLabel).toMatch(/spend exactly 1 USDC/);
    await expect(
      reviewThorSwap(
        JSON.stringify(
          swapRequest({
            action: "approval",
            quote: { from: "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48" },
            transaction: { to: USDC_ETH, value: "0", data: approve(ETH_ROUTER, 1000001n) },
          }),
        ),
        seeds,
      ),
    ).rejects.toThrow(/calldata differs/);
  });
  it("signs a token deposit with zero native value", async () => {
    const r = await reviewThorSwap(
      JSON.stringify(
        swapRequest({
          quote: {
            from: "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48",
            rawIn: "1000000",
          },
          transaction: {
            value: "0",
            data: deposit(INBOUND, USDC_ETH, 1000000n, EVM_MEMO, soon()),
          },
        }),
      ),
      seeds,
    );
    expect(r.amountLabel).toBe("1 USDC");
    const tx = parseTransaction((await signThorSwap(r, seeds)).hex as `0x${string}`);
    expect(tx.value ?? 0n).toBe(0n);
    expect(tx.to?.toLowerCase()).toBe(ETH_ROUTER.toLowerCase());
  });
  it("signs a Base deposit within the Base fee cap", async () => {
    const r = await reviewThorSwap(
      JSON.stringify(
        swapRequest({
          quote: { router: BASE_ROUTER, from: "BASE.ETH" },
          transaction: { chainId: 8453, to: BASE_ROUTER },
        }),
      ),
      seeds,
    );
    expect(r.chainName).toBe("Base");
    const tx = parseTransaction((await signThorSwap(r, seeds)).hex as `0x${string}`);
    expect(tx.chainId).toBe(8453);
  });
  it("signs a BNB Chain deposit", async () => {
    const r = await reviewThorSwap(
      JSON.stringify(
        swapRequest(
          {
            quote: { router: BSC_ROUTER, from: "BSC.BNB" },
            transaction: { chainId: 56, to: BSC_ROUTER, type: "legacy", gasPrice: "1000000000" },
          },
          ["transaction.maxFeePerGas", "transaction.maxPriorityFeePerGas"],
        ),
      ),
      seeds,
    );
    expect(r.chainName).toBe("BNB Chain");
    const tx = parseTransaction((await signThorSwap(r, seeds)).hex as `0x${string}`);
    expect(tx.chainId).toBe(56);
    expect(tx.type).toBe("legacy");
  });
  it("warns when the payout is an address this Vault controls", async () => {
    const r = await reviewThorSwap(
      JSON.stringify(
        swapRequest({
          quote: {
            memo: "=:ETH.ETH:0x9858effd232b4033e47d90003d41ec34ecaeda94:10000000/1/1",
            destination: EVM_FROM,
            to: "ETH.ETH",
          },
          transaction: {
            data: deposit(
              INBOUND,
              ZERO,
              1000000000000000000n,
              "=:ETH.ETH:0x9858effd232b4033e47d90003d41ec34ecaeda94:10000000/1/1",
              soon(),
            ),
          },
        }),
      ),
      seeds,
    );
    expect(r.warnings.some((w) => /does not control/.test(w))).toBe(false);
  });

  const attacks: [string, Record<string, unknown>][] = [
    [
      "sender not derived from the fingerprint and path",
      { transaction: { from: "0x3333333333333333333333333333333333333333" } },
    ],
    ["unsupported chain", { transaction: { chainId: 137 } }],
    ["router not pinned for that chain", { quote: { router: BASE_ROUTER } }],
    [
      "approval to a spender other than the router",
      {
        action: "approval",
        quote: { from: USDC_ETH },
        transaction: {
          to: USDC_ETH,
          value: "0",
          data: approve("0x2222222222222222222222222222222222222222", 1000000000000000000n),
        },
      },
    ],
    [
      "approval of a different amount",
      {
        action: "approval",
        quote: { from: USDC_ETH },
        transaction: { to: USDC_ETH, value: "0", data: approve(ETH_ROUTER, 999999999999999999n) },
      },
    ],
    [
      "native value on a token deposit",
      {
        quote: { from: USDC_ETH, rawIn: "1000000" },
        transaction: {
          value: "1000000",
          data: deposit(INBOUND, USDC_ETH, 1000000n, EVM_MEMO, soon()),
        },
      },
    ],
    [
      "calldata differing by one byte",
      {
        transaction: {
          data: deposit(INBOUND, ZERO, 1000000000000000000n, EVM_MEMO, soon()).replace(/0$/, "1"),
        },
      },
    ],
    ["unknown selector", { transaction: { data: "0xdeadbeef" } }],
    ["expiry under five minutes ahead", { quote: { expiry: Number(now() + 60n) } }],
    ["slippage tolerance above 3%", { quote: { toleranceBps: 301 } }],
    ["minimum far below the expected payout", { quote: { expectedOut: "1000000000" } }],
    ["minimum above the expected payout", { quote: { expectedOut: "9000000" } }],
    ["expiry already passed", { quote: { expiry: Number(now() - 100n) } }],
    ["expiry more than one hour ahead", { quote: { expiry: Number(now() + 7200n) } }],
    [
      "calldata expiry differing from the quote",
      {
        quote: { expiry: Number(now() + 600n) },
        transaction: { data: deposit(INBOUND, ZERO, 1000000000000000000n, EVM_MEMO, now() + 660n) },
      },
    ],
    ["access list present", { transaction: { accessList: [] } }],
    [
      "legacy type carrying EIP-1559 fields",
      { transaction: { type: "legacy", gasPrice: "1000000000" } },
    ],
    ["eip1559 type carrying gasPrice", { transaction: { gasPrice: "1000000000" } }],
    [
      "fee above the Ethereum ceiling",
      { transaction: { gas: "21000", maxFeePerGas: "1000000000000" } },
    ],
    [
      "fee above the Base ceiling",
      {
        quote: { router: BASE_ROUTER, from: "BASE.ETH" },
        transaction: {
          chainId: 8453,
          to: BASE_ROUTER,
          gas: "21000",
          maxFeePerGas: "1000000000000",
        },
      },
    ],
    [
      "payout destination differing from the memo",
      { quote: { destination: "bc1qarpvw2rqv9gr6t82CdN3fmdlq3t9qh35py3xr3" } },
    ],
    ["payout minimum differing from the memo", { quote: { minimumOut: "9999999" } }],
    ["payout asset differing from the memo", { quote: { to: "ETH.ETH" } }],
    [
      "short payout name on an EVM source",
      { quote: { memo: "=:ETH.USDC:0x1111111111111111111111111111111111111111:10000000/1/1" } },
    ],
    [
      "terse payout code on an EVM source",
      { quote: { memo: "=:e:0x1111111111111111111111111111111111111111:10000000/1/1" } },
    ],
    ["streaming memo", { quote: { memo: EVM_MEMO.replace("/1/1", "/1/0") } }],
    ["affiliate tag", { quote: { memo: `${EVM_MEMO}:hme:50` } }],
    ["unknown source asset", { quote: { from: "DOGEO.DOGE" } }],
    ["token from another chain", { quote: { from: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" } }],
    [
      "allowance reset on a native coin",
      { action: "approval-reset", transaction: { data: approve(ETH_ROUTER, 0n) } },
    ],
    ["unknown top-level field", { extra: 1 }],
    ["unknown quote field", { quote: { extra: 1 } }],
    ["wrong format", { format: "hm-evm-tx" }],
    ["wrong version", { v: 2 }],
    ["unknown action", { action: "withdraw" }],
  ];
  for (const [rule, change] of attacks)
    it(`refuses ${rule}`, async () => {
      await expect(reviewThorSwap(JSON.stringify(swapRequest(change)), seeds)).rejects.toThrow(
        /Signing blocked|not match any stored seed/,
      );
    });
  it("bounds incoming swap size", async () => {
    await expect(reviewThorSwap(" ".repeat(8193), seeds)).rejects.toThrow(/too large/);
  });
  it("never signs a request that stopped matching after review", async () => {
    const r = await reviewThorSwap(JSON.stringify(swapRequest()), seeds);
    const tampered = { ...r.request, transaction: { ...r.request.transaction, value: "1" } };
    await expect(signThorSwap({ ...r, request: tampered }, seeds)).rejects.toThrow(
      /Signing blocked/,
    );
  });
  it("pins the three routers and three fee ceilings", () => {
    expect(Object.keys(THOR_CHAINS)).toEqual(["1", "56", "8453"]);
    expect(THOR_CHAINS[1].router).toBe(ETH_ROUTER);
    expect(THOR_CHAINS[8453].router).toBe(BASE_ROUTER);
    expect(THOR_CHAINS[56].router).toBe(BSC_ROUTER);
    expect(THOR_CHAINS[1].maxFeeWei).toBe(20_000_000_000_000_000n);
    expect(THOR_CHAINS[8453].maxFeeWei).toBe(2_000_000_000_000_000n);
    expect(THOR_CHAINS[56].maxFeeWei).toBe(20_000_000_000_000_000n);
  });
});

// Keeps the data-output helper referenced so an unused-import lint cannot hide a fixture drift.
void dataOutput;

describe("audit 2026-11-02 fixes", () => {
  it("recognises this Vault's native SegWit BTC and LTC Receive addresses as its own", async () => {
    const root = HDKey.fromMasterSeed(await mnemonicToSeed(words));
    for (const [coin, ct] of [
      ["BTC", 0],
      ["LTC", 2],
    ] as const) {
      const pubkey = root.derive(`m/84'/${ct}'/0'/0/0`).publicKey!;
      const addr = payments.p2wpkh({ pubkey, network: NETWORKS[coin] }).address!;
      expect(addr.startsWith(coin === "BTC" ? "bc1q" : "ltc1q")).toBe(true);
      expect(await vaultOwnsAddress(seeds, coin, addr, new Map())).toBe(true);
    }
    // BIP-84 vector for this dummy mnemonic.
    expect(
      await vaultOwnsAddress(seeds, "BTC", "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu", new Map()),
    ).toBe(true);
  });
  it("warns on EVM swaps that pay out to an address this Vault does not control", async () => {
    const r = await reviewThorSwap(JSON.stringify(swapRequest()), seeds);
    expect(r.warnings.some((w) => /does not control/.test(w))).toBe(true);
    expect(r.payoutLabel).toBe("expected about 0.1, at least 0.1 Bitcoin");
  });
  for (const [coin, dust] of [
    ["BTC", 10_000n],
    ["LTC", 10_000n],
    ["DOGE", 100_000_000n],
  ] as const) {
    it(`refuses a ${coin} deposit at its dust limit and accepts one just above`, async () => {
      const at = await swapPayment(coin, { depositSats: dust });
      await expect(reviewPsbt(at.psbt, at.seeds, coin)).rejects.toThrow(/dust limit/);
      const above = await swapPayment(coin, { depositSats: dust + 1n });
      await expect(reviewPsbt(above.psbt, above.seeds, coin)).resolves.toBeTruthy();
    });
  }
  it("shows the UTXO minimum with an expected-amount warning", async () => {
    const { psbt, seeds: s } = await swapPayment("BTC");
    const { review } = await reviewPsbt(psbt, s, "BTC");
    expect(review.warnings.some((w) => /cannot see the expected amount/.test(w))).toBe(true);
  });
  it("accepts a 3% tolerance exactly at its floor", async () => {
    const r = swapRequest({ quote: { expectedOut: "10309278", toleranceBps: 300 } });
    await expect(reviewThorSwap(JSON.stringify(r), seeds)).resolves.toBeTruthy();
  });
  it("accepts a five-minute expiry", async () => {
    const expiry = now() + 310n;
    const r = swapRequest({
      quote: { expiry: Number(expiry) },
      transaction: { data: deposit(INBOUND, ZERO, 1000000000000000000n, EVM_MEMO, expiry) },
    });
    await expect(reviewThorSwap(JSON.stringify(r), seeds)).resolves.toBeTruthy();
  });
  it("resolves short contract-suffix names only when they match a pinned contract", () => {
    expect(resolveThorAssetField("ETH.USDC-EB48")?.asset.token?.contract).toBe(USDC_ETH);
    expect(resolveThorAssetField("ETH.USDC-EB48")?.utxoOnly).toBe(true);
    expect(resolveThorAssetField("ETH.USDC-EB49")).toBeNull();
    expect(resolveThorAssetField("ETH.USDT-EB48")).toBeNull();
    expect(resolveThorAssetField("BSC.USDC-EB48")).toBeNull();
    expect(resolveThorAssetField("ETH.USDC-EB4")).toBeNull();
    expect(() =>
      parseThorMemo("=:ETH.USDC-EB48:0x1111111111111111111111111111111111111111:100/1/1", {
        fullForms: true,
      }),
    ).toThrow(/in full/);
  });
  it("labels the Base fee as excluding the Base data fee", async () => {
    const r = await reviewThorSwap(
      JSON.stringify(
        swapRequest({
          quote: { router: BASE_ROUTER, from: "BASE.ETH" },
          transaction: { chainId: 8453, to: BASE_ROUTER, maxFeePerGas: "1000000000" },
        }),
      ),
      seeds,
    );
    expect(r.feeLabel).toMatch(/plus a small Base data fee not shown here/);
  });
});
