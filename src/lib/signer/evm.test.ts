import { describe, expect, it } from "vitest";
import { decodeFunctionData, keccak256, parseTransaction, recoverTransactionAddress, type TransactionSerialized } from "viem";
import { reviewEvm, signEvm } from "./evm";
const words = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const seeds = [{ id: "evm-dummy", name: "Dummy", words, fingerprint: "73c5da0a" }];
export const dummyEvm = { format: "hm-evm-tx", v: 1, kind: "native-transfer", fp: "73c5da0a", path: "m/44'/60'/0'/0/0", chainId: 1, from: "0x9858effd232b4033e47d90003d41ec34ecaeda94", to: "0x1111111111111111111111111111111111111111", value: "1000000000000000000", nonce: 7, gas: "21000", type: "eip1559", maxFeePerGas: "30000000000", maxPriorityFeePerGas: "1000000000" };
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
    expect((await recoverTransactionAddress({ serializedTransaction: hex as TransactionSerialized })).toLowerCase()).toBe(dummyEvm.from);
  });
  it("supports replay-protected legacy EVM transactions", async () => {
    const { maxFeePerGas, maxPriorityFeePerGas, ...base } = dummyEvm;
    const r = await reviewEvm(JSON.stringify({ ...base, chainId: 56, type: "legacy", gasPrice: "1000000000" }), seeds);
    const signed = await signEvm(r, seeds);
    const tx = parseTransaction(signed.hex as `0x${string}`);
    expect(tx.chainId).toBe(56);
    expect(tx.type).toBe("legacy");
    expect(tx.gasPrice).toBe(1000000000n);
  });
  it("locally builds ERC20 transfer calldata and shows untrusted raw units", async () => {
    const { value, ...base } = dummyEvm;
    const token = "0x2222222222222222222222222222222222222222";
    const r = await reviewEvm(JSON.stringify({ ...base, kind: "erc20-transfer", token, amount: "123456789", gas: "65000" }), seeds);
    expect(r.amountLabel).toBe("123456789 raw token units");
    const signed = await signEvm(r, seeds);
    const tx = parseTransaction(signed.hex as `0x${string}`);
    expect(tx.to?.toLowerCase()).toBe(token);
    expect(tx.value ?? 0n).toBe(0n);
    const decoded = decodeFunctionData({ abi: [{ type: "function", name: "transfer", inputs: [{ type: "address", name: "to" }, { type: "uint256", name: "amount" }], outputs: [], stateMutability: "nonpayable" }], data: tx.data ?? "0x" });
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
  for (const [rule, change] of [
    ["wrong sender", { from: "0x3333333333333333333333333333333333333333" }],
    ["wrong path", { path: "m/44'/60'/0'/0/1" }], ["wrong fingerprint", { fp: "deadbeef" }],
    ["chain zero", { chainId: 0 }], ["negative amount", { value: "-1" }], ["exponential amount", { value: "1e18" }],
    ["zero recipient", { to: "0x0000000000000000000000000000000000000000" }],
    ["blind calldata", { data: "0x095ea7b3" }], ["approvals", { kind: "erc20-approve" }],
    ["priority above maximum", { maxPriorityFeePerGas: "30000000001" }], ["missing fee", { maxFeePerGas: undefined }],
    ["mixed fee modes", { gasPrice: "1" }], ["unsafe nonce", { nonce: -1 }],
  ] as const) it(`rejects ${rule}`, async () => {
    await expect(reviewEvm(JSON.stringify({ ...dummyEvm, ...change }), seeds)).rejects.toThrow();
  });
  it("bounds incoming payment size", async () => { await expect(reviewEvm(" ".repeat(8193), seeds)).rejects.toThrow(/too large/); });
});
