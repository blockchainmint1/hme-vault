/** Local transaction-only EVM signer: no RPC, messages, approvals, or arbitrary contract calls. */
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { z } from "zod";
import { encodeFunctionData, formatUnits, getAddress, keccak256, type Address, type TransactionSerializable } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { SignerSeed } from "./psbt";

const MAX_UINT256 = (1n << 256n) - 1n;
const uint = z.string().regex(/^(0|[1-9][0-9]{0,77})$/).refine((v) => BigInt(v) <= MAX_UINT256, "Quantity exceeds uint256.");
const address = z.string().refine((s) => { try { return getAddress(s) !== "0x0000000000000000000000000000000000000000" && /^0x[0-9a-fA-F]{40}$/.test(s); } catch { return false; } }, "Invalid or zero address.");
const common = {
  format: z.literal("hm-evm-tx"), v: z.literal(1),
  fp: z.string().regex(/^[0-9a-fA-F]{8}$/),
  path: z.string().regex(/^m\/44'\/60'\/(0|[1-9][0-9]{0,5})'\/0\/(0|[1-9][0-9]{0,5})$/),
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  from: address, to: address,
  nonce: z.number().int().min(0).max(0xffffffff),
  gas: uint.refine((s) => BigInt(s) >= 21_000n && BigInt(s) <= 100_000_000n, "Invalid gas limit."),
  type: z.enum(["legacy", "eip1559"]),
  gasPrice: uint.optional(), maxFeePerGas: uint.optional(), maxPriorityFeePerGas: uint.optional(),
};
const schema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("native-transfer"), value: uint.refine((s) => BigInt(s) > 0n, "Amount must be positive.") }).strict(),
  z.object({ ...common, kind: z.literal("erc20-transfer"), token: address, amount: uint.refine((s) => BigInt(s) > 0n, "Amount must be positive.") }).strict(),
]);
export type EvmRequest = z.infer<typeof schema>;
const CHAINS: Record<number, { name: string; symbol: string }> = {
  1: { name: "Ethereum", symbol: "ETH" }, 10: { name: "Optimism", symbol: "ETH" }, 56: { name: "BNB Smart Chain", symbol: "BNB" },
  137: { name: "Polygon", symbol: "POL" }, 8453: { name: "Base", symbol: "ETH" }, 42161: { name: "Arbitrum One", symbol: "ETH" },
  43114: { name: "Avalanche C-Chain", symbol: "AVAX" }, 11155111: { name: "Ethereum Sepolia (testnet)", symbol: "test ETH" },
};
const TRANSFER_ABI = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }] as const;
export interface EvmReview {
  request: EvmRequest; seedName: string; chainName: string; symbol: string;
  amountLabel: string; feeLabel: string; totalLabel: string; warnings: string[];
}
function parseRequest(text: string): EvmRequest {
  if (text.length > 8192) throw new Error("EVM payment is too large.");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("That isn't an EVM payment QR."); }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new Error("Invalid EVM payment. Only native or ERC-20 transfers with explicit chain, sender, path and fees are supported.");
  const r = result.data;
  if (r.type === "legacy") {
    if (!r.gasPrice || BigInt(r.gasPrice) === 0n || r.maxFeePerGas !== undefined || r.maxPriorityFeePerGas !== undefined) throw new Error("Legacy payments require only gasPrice.");
  } else {
    if (!r.maxFeePerGas || r.maxPriorityFeePerGas === undefined || r.gasPrice !== undefined || BigInt(r.maxFeePerGas) === 0n || BigInt(r.maxPriorityFeePerGas) > BigInt(r.maxFeePerGas)) throw new Error("Invalid EIP-1559 fees.");
  }
  if (BigInt(r.gas) * BigInt(r.gasPrice ?? r.maxFeePerGas ?? "0") > MAX_UINT256) throw new Error("Fee exceeds uint256.");
  return Object.freeze(r);
}
async function accountFor(r: EvmRequest, seeds: SignerSeed[]) {
  for (const s of seeds) {
    if (s.fingerprint.toLowerCase() !== r.fp.toLowerCase()) continue;
    const root = HDKey.fromMasterSeed(await mnemonicToSeed(s.words, s.passphrase ?? ""));
    if (root.fingerprint.toString(16).padStart(8, "0") !== r.fp.toLowerCase()) continue;
    const key = root.derive(r.path);
    if (!key.privateKey) continue;
    const privateKey = `0x${Array.from(key.privateKey, (b) => b.toString(16).padStart(2, "0")).join("")}` as const;
    const account = privateKeyToAccount(privateKey);
    if (account.address.toLowerCase() === r.from.toLowerCase()) return { account, seedName: s.name };
  }
  throw new Error("The EVM sender, fingerprint and path don't match any stored seed.");
}
export async function reviewEvm(text: string, seeds: SignerSeed[]): Promise<EvmReview> {
  const request = parseRequest(text);
  const { seedName } = await accountFor(request, seeds);
  const chain = CHAINS[request.chainId];
  const fee = BigInt(request.gas) * BigInt(request.gasPrice ?? request.maxFeePerGas ?? "0");
  const value = request.kind === "native-transfer" ? BigInt(request.value) : 0n;
  const label = (v: bigint) => chain ? `${formatUnits(v, 18)} ${chain.symbol}` : `${v} native base units`;
  const warnings: string[] = [];
  if (!chain) warnings.push("Unlisted EVM network: verify the chain ID yourself. Amounts and fees are shown as raw native base units.");
  if (request.kind === "erc20-transfer") warnings.push("Token identity and decimals cannot be verified offline. Compare the contract address and raw token units; a contract may behave differently from a standard ERC-20.");
  if (value > 0n && fee * 20n > value) warnings.push("The maximum network fee is more than 5% of what you're sending.");
  return { request, seedName, chainName: chain?.name ?? "Unlisted EVM network", symbol: chain?.symbol ?? "native base units", amountLabel: request.kind === "erc20-transfer" ? `${request.amount} raw token units` : label(value), feeLabel: label(fee), totalLabel: label(value + fee), warnings };
}
export async function signEvm(review: EvmReview, seeds: SignerSeed[]): Promise<{ hex: string; txid: string }> {
  const r = parseRequest(JSON.stringify(review.request));
  const { account } = await accountFor(r, seeds);
  const tx: TransactionSerializable = {
    chainId: r.chainId, nonce: r.nonce, gas: BigInt(r.gas), type: r.type,
    to: getAddress(r.kind === "erc20-transfer" ? r.token : r.to) as Address,
    value: r.kind === "native-transfer" ? BigInt(r.value) : 0n,
    ...(r.kind === "erc20-transfer" ? { data: encodeFunctionData({ abi: TRANSFER_ABI, functionName: "transfer", args: [getAddress(r.to), BigInt(r.amount)] }) } : {}),
    ...(r.type === "legacy" ? { gasPrice: BigInt(r.gasPrice ?? "0") } : { maxFeePerGas: BigInt(r.maxFeePerGas ?? "0"), maxPriorityFeePerGas: BigInt(r.maxPriorityFeePerGas ?? "0") }),
  };
  const signed = await account.signTransaction(tx);
  return { hex: signed, txid: keccak256(signed) };
}
