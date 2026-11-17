import { describe, expect, it } from "vitest";
import {
  decodeFunctionData,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  type TransactionSerialized,
} from "viem";
import { reviewEvm, signEvm } from "./evm";
const words =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const seeds = [{ id: "evm-dummy", name: "Dummy", words, fingerprint: "73c5da0a" }];
export const dummyEvm = {
  format: "hm-evm-tx",
  v: 1,
  kind: "native-transfer",
  fp: "73c5da0a",
  path: "m/44'/60'/0'/0/0",
  chainId: 1,
  from: "0x9858effd232b4033e47d90003d41ec34ecaeda94",
  to: "0x1111111111111111111111111111111111111111",
  value: "1000000000000000000",
  nonce: 7,
  gas: "21000",
  type: "eip1559",
  maxFeePerGas: "30000000000",
  maxPriorityFeePerGas: "1000000000",
};
describe("offline EVM signing", () => {
  it("reviews native value and maximum fee and produces a recoverable chain-bound signature", async () => {
    const r = await reviewEvm(JSON.stringify(dummyEvm), seeds);
    expect(r.amountLabel).toBe("1 ETH");
    expect(r.feeLabel).toBe("0.00063 ETH");
    const signed = await signEvm(r, seeds);
    const hex = signed.hex as `0x${string}`;
    const tx = parseTransaction(hex);
    expect(tx.chainId).toBe(1);
    expect(tx.nonce).toBe(7);
    expect(tx.to?.toLowerCase()).toBe(dummyEvm.to);
    expect(tx.value).toBe(1000000000000000000n);
    expect(tx.maxFeePerGas).toBe(30000000000n);
    expect(signed.txid).toBe(keccak256(hex));
    expect(
      (
        await recoverTransactionAddress({ serializedTransaction: hex as TransactionSerialized })
      ).toLowerCase(),
    ).toBe(dummyEvm.from);
  });
  it("supports replay-protected legacy EVM transactions", async () => {
    const { maxFeePerGas, maxPriorityFeePerGas, ...base } = dummyEvm;
    const r = await reviewEvm(
      JSON.stringify({ ...base, chainId: 56, type: "legacy", gasPrice: "1000000000" }),
      seeds,
    );
    const signed = await signEvm(r, seeds);
    const tx = parseTransaction(signed.hex as `0x${string}`);
    expect(tx.chainId).toBe(56);
    expect(tx.type).toBe("legacy");
    expect(tx.gasPrice).toBe(1000000000n);
  });
  it("locally builds ERC20 transfer calldata and shows untrusted raw units", async () => {
    const { value, ...base } = dummyEvm;
    const token = "0x2222222222222222222222222222222222222222";
    const r = await reviewEvm(
      JSON.stringify({ ...base, kind: "erc20-transfer", token, amount: "123456789", gas: "65000" }),
      seeds,
    );
    expect(r.amountLabel).toBe("123456789 raw token units");
    const signed = await signEvm(r, seeds);
    const tx = parseTransaction(signed.hex as `0x${string}`);
    expect(tx.to?.toLowerCase()).toBe(token);
    expect(tx.value ?? 0n).toBe(0n);
    const decoded = decodeFunctionData({
      abi: [
        {
          type: "function",
          name: "transfer",
          inputs: [
            { type: "address", name: "to" },
            { type: "uint256", name: "amount" },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ],
      data: tx.data ?? "0x",
    });
    expect(decoded.functionName).toBe("transfer");
    expect(decoded.args?.[1]).toBe(123456789n);
    expect(String(decoded.args?.[0]).toLowerCase()).toBe(dummyEvm.to);
  });
  it("allows custom EVM IDs but never invents their currency decimals", async () => {
    const r = await reviewEvm(JSON.stringify({ ...dummyEvm, chainId: 123456 }), seeds);
    expect(r.amountLabel).toBe("1000000000000000000 native base units");
    const tx = parseTransaction((await signEvm(r, seeds)).hex as `0x${string}`);
    expect(tx.chainId).toBe(123456);
  });
  it("accepts lowercase addresses and correctly checksummed mixed-case addresses", async () => {
    const lower = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const checksummed = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    await expect(
      reviewEvm(JSON.stringify({ ...dummyEvm, to: lower }), seeds),
    ).resolves.toBeTruthy();
    await expect(
      reviewEvm(JSON.stringify({ ...dummyEvm, to: checksummed }), seeds),
    ).resolves.toBeTruthy();
  });
  it("refuses a mixed-case address with a bad checksum", async () => {
    const badChecksum = "0xa0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    await expect(
      reviewEvm(JSON.stringify({ ...dummyEvm, to: badChecksum }), seeds),
    ).rejects.toThrow(/Invalid EVM payment/);
  });
  it.each([
    [1, "200000000", "200000001", "0.02 ETH"],
    [56, "200000000", "200000001", "0.02 BNB"],
    [8453, "20000000", "20000001", "0.002 ETH"],
  ] as const)("enforces the chain %i payment fee ceiling", async (chainId, atCap, aboveCap, label) => {
    await expect(
      reviewEvm(
        JSON.stringify({ ...dummyEvm, chainId, gas: "100000", maxFeePerGas: atCap }),
        seeds,
      ),
    ).resolves.toBeTruthy();
    await expect(
      reviewEvm(
        JSON.stringify({ ...dummyEvm, chainId, gas: "100000", maxFeePerGas: aboveCap }),
        seeds,
      ),
    ).rejects.toThrow(`payment limit of ${label}`);
  });
  it("refuses the auditor's 2.4 ETH fee example instead of only warning", async () => {
    await expect(
      reviewEvm(
        JSON.stringify({ ...dummyEvm, gas: "1200000", maxFeePerGas: "2000000000000" }),
        seeds,
      ),
    ).rejects.toThrow(/payment limit of 0.02 ETH/);
  });
  it("keeps the high-fee warning without a hard cap on unlisted chains", async () => {
    const r = await reviewEvm(
      JSON.stringify({
        ...dummyEvm,
        chainId: 123456,
        value: "1",
        gas: "1200000",
        maxFeePerGas: "2000000000000",
      }),
      seeds,
    );
    expect(r.warnings).toContain("The maximum network fee is more than 5% of what you're sending.");
  });
  for (const [rule, change] of [
    ["wrong sender", { from: "0x3333333333333333333333333333333333333333" }],
    ["wrong path", { path: "m/44'/60'/0'/0/1" }],
    ["wrong fingerprint", { fp: "deadbeef" }],
    ["chain zero", { chainId: 0 }],
    ["negative amount", { value: "-1" }],
    ["exponential amount", { value: "1e18" }],
    ["zero recipient", { to: "0x0000000000000000000000000000000000000000" }],
    ["blind calldata", { data: "0x095ea7b3" }],
    ["approvals", { kind: "erc20-approve" }],
    ["priority above maximum", { maxPriorityFeePerGas: "30000000001" }],
    ["missing fee", { maxFeePerGas: undefined }],
    ["mixed fee modes", { gasPrice: "1" }],
    ["unsafe nonce", { nonce: -1 }],
  ] as const)
    it(`rejects ${rule}`, async () => {
      await expect(reviewEvm(JSON.stringify({ ...dummyEvm, ...change }), seeds)).rejects.toThrow();
    });
  it("bounds incoming payment size", async () => {
    await expect(reviewEvm(" ".repeat(8193), seeds)).rejects.toThrow(/too large/);
  });
});

describe("native-disperse bulk payments", () => {
  const recips = Array.from(
    { length: 10 },
    (_, i) => `0x${(i + 1).toString(16).padStart(40, "a")}`,
  );
  const ok = {
    ...dummyEvm,
    kind: "native-disperse",
    to: "0xd152f549545093347a162dce210e7293f1452150",
    recipients: recips,
    values: recips.map(() => "1000000000000000"),
    value: "10000000000000000",
    gas: "200000",
  };
  const bad = (o: object) =>
    expect(reviewEvm(JSON.stringify({ ...ok, ...o }), seeds)).rejects.toThrow();
  it("signs a 10-recipient payment with locally rebuilt disperseEther calldata", async () => {
    const r = await reviewEvm(JSON.stringify(ok), seeds);
    expect(r.payouts).toHaveLength(10);
    const { hex } = await signEvm(r, seeds);
    const tx = parseTransaction(hex as TransactionSerialized);
    expect(tx.to?.toLowerCase()).toBe(ok.to);
    expect(tx.value).toBe(10000000000000000n);
    expect(tx.data?.slice(0, 10)).toBe("0xe63d38ed");
    expect(
      (
        await recoverTransactionAddress({ serializedTransaction: hex as TransactionSerialized })
      ).toLowerCase(),
    ).toBe(dummyEvm.from);
  });
  it("rejects wrong contract", () => bad({ to: "0x1111111111111111111111111111111111111111" }));
  it("rejects unsupported chain", () => bad({ chainId: 137 }));
  it("rejects mismatched list lengths", () =>
    bad({ values: ok.values.slice(1), value: "9000000000000000" }));
  it("rejects duplicate recipient", () => bad({ recipients: [...recips.slice(0, 9), recips[0]] }));
  it("rejects zero value", () =>
    bad({ values: [...ok.values.slice(0, 9), "0"], value: "9000000000000000" }));
  it("rejects total not equal to sum", () => bad({ value: "1" }));
  it("rejects gas below 21000 + 9000 per recipient", () => bad({ gas: "110999" }));
  it("rejects gas above 60000 + 40000 per recipient", () => bad({ gas: "460001" }));
  it("rejects paying the sender", () =>
    bad({ recipients: [...recips.slice(0, 9), dummyEvm.from] }));
  it("rejects more than 50 recipients", () => {
    const many = Array.from(
      { length: 51 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "b")}`,
    );
    return bad({ recipients: many, values: many.map(() => "1"), value: "51", gas: "1000000" });
  });
  it("rejects supplied calldata", () => bad({ data: "0xe63d38ed" }));
  it("rejects a bulk payment above the Ethereum fee ceiling", () =>
    bad({ maxFeePerGas: "10000000000000" }));
  it("rejects a badly checksummed recipient instead of normalizing it", () =>
    bad({
      recipients: [...recips.slice(0, 9), "0xa0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],
    }));
});
