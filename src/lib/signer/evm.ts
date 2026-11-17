/** Local transaction-only EVM signer: no RPC, messages, approvals, or arbitrary contract calls. */
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { z } from "zod";
import {
  encodeFunctionData,
  formatUnits,
  getAddress,
  keccak256,
  type Address,
  type TransactionSerializable,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { SignerSeed } from "./psbt";
import { evmAddress } from "./evm-address";
import { THOR_CHAINS } from "./thor";

const MAX_UINT256 = (1n << 256n) - 1n;
const uint = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,77})$/)
  .refine((v) => BigInt(v) <= MAX_UINT256, "Quantity exceeds uint256.");
const address = evmAddress;
const common = {
  format: z.literal("hm-evm-tx"),
  v: z.literal(1),
  fp: z.string().regex(/^[0-9a-fA-F]{8}$/),
  path: z.string().regex(/^m\/44'\/60'\/(0|[1-9][0-9]{0,5})'\/0\/(0|[1-9][0-9]{0,5})$/),
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  from: address,
  to: address,
  nonce: z.number().int().min(0).max(0xffffffff),
  gas: uint.refine((s) => BigInt(s) >= 21_000n && BigInt(s) <= 100_000_000n, "Invalid gas limit."),
  type: z.enum(["legacy", "eip1559"]),
  gasPrice: uint.optional(),
  maxFeePerGas: uint.optional(),
  maxPriorityFeePerGas: uint.optional(),
};
const schema = z.discriminatedUnion("kind", [
  z
    .object({
      ...common,
      kind: z.literal("native-transfer"),
      value: uint.refine((s) => BigInt(s) > 0n, "Amount must be positive."),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("erc20-transfer"),
      token: address,
      amount: uint.refine((s) => BigInt(s) > 0n, "Amount must be positive."),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("native-disperse"),
      recipients: z.array(address).min(1).max(50),
      values: z
        .array(uint.refine((s) => BigInt(s) > 0n, "Amount must be positive."))
        .min(1)
        .max(50),
      value: uint,
    })
    .strict(),
]);
/** Disperse.app contract, same address on Ethereum, BNB Chain and Base. Only disperseEther is ever encoded. */
export const DISPERSE_ADDRESS = "0xD152f549545093347A162Dce210e7293f1452150";
export const DISPERSE_CHAINS = [1, 56, 8453] as const;
/** Release-time eth_getCode evidence only; the offline app never performs an RPC lookup. */
export const DISPERSE_CODE_CHECKED_AT = "2026-11-17";
export const DISPERSE_CODE_HASHES = Object.freeze({
  1: "0x65660051e320731a70b9ddcd5ec9fd4f565cf85e2f6caf0eb71589fb544b9996",
  56: "0x65660051e320731a70b9ddcd5ec9fd4f565cf85e2f6caf0eb71589fb544b9996",
  8453: "0xc0a38c227d2c70248fc51ed0dd3a72df3adf5b41494c7f3cc19c16c38523244d",
} as const);
export const DISPERSE_MAX_RECIPIENTS = 50;
const DISPERSE_ABI = [
  {
    type: "function",
    name: "disperseEther",
    stateMutability: "payable",
    inputs: [
      { name: "recipients", type: "address[]" },
      { name: "values", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;
export function disperseCalldata(recipients: string[], values: string[]) {
  return encodeFunctionData({
    abi: DISPERSE_ABI,
    functionName: "disperseEther",
    args: [recipients.map((a) => getAddress(a)), values.map((v) => BigInt(v))],
  });
}
function checkDisperse(r: Extract<EvmRequest, { kind: "native-disperse" }>) {
  const fail = (m: string) => {
    throw new Error(`Bulk payment refused: ${m}`);
  };
  if (!(DISPERSE_CHAINS as readonly number[]).includes(r.chainId))
    fail("only Ethereum, BNB Chain and Base are supported.");
  if (getAddress(r.to) !== DISPERSE_ADDRESS) fail("not the pinned Disperse contract.");
  const n = r.recipients.length;
  if (r.values.length !== n) fail("recipient and amount counts differ.");
  const seen = new Set<string>();
  for (const a of r.recipients) {
    const c = getAddress(a);
    if (seen.has(c)) fail("a recipient appears twice.");
    if (c === getAddress(r.from)) fail("you can't pay yourself.");
    if (c === DISPERSE_ADDRESS) fail("the contract can't be a recipient.");
    seen.add(c);
  }
  const sum = r.values.reduce((t, v) => t + BigInt(v), 0n);
  if (sum !== BigInt(r.value)) fail("total doesn't equal the sum of amounts.");
  const gas = BigInt(r.gas);
  const k = BigInt(n);
  if (gas < 21_000n + 9_000n * k || gas > 60_000n + 40_000n * k) fail("gas limit out of range.");
}
export type EvmRequest = z.infer<typeof schema>;
const CHAINS: Record<number, { name: string; symbol: string }> = {
  1: { name: "Ethereum", symbol: "ETH" },
  10: { name: "Optimism", symbol: "ETH" },
  56: { name: "BNB Smart Chain", symbol: "BNB" },
  137: { name: "Polygon", symbol: "POL" },
  8453: { name: "Base", symbol: "ETH" },
  42161: { name: "Arbitrum One", symbol: "ETH" },
  43114: { name: "Avalanche C-Chain", symbol: "AVAX" },
  11155111: { name: "Ethereum Sepolia (testnet)", symbol: "test ETH" },
};
const TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
export interface EvmReview {
  request: EvmRequest;
  seedName: string;
  chainName: string;
  symbol: string;
  amountLabel: string;
  feeLabel: string;
  totalLabel: string;
  warnings: string[];
  /** Every Disperse recipient, in order, for full on-screen review. */
  payouts?: { address: string; amountLabel: string }[];
}
function parseRequest(text: string): EvmRequest {
  if (text.length > 8192) throw new Error("EVM payment is too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That isn't an EVM payment QR.");
  }
  const result = schema.safeParse(parsed);
  if (!result.success)
    throw new Error(
      "Invalid EVM payment. Only native, ERC-20 or pinned Disperse bulk payments with explicit chain, sender, path and fees are supported.",
    );
  const r = result.data;
  if (r.type === "legacy") {
    if (
      !r.gasPrice ||
      BigInt(r.gasPrice) === 0n ||
      r.maxFeePerGas !== undefined ||
      r.maxPriorityFeePerGas !== undefined
    )
      throw new Error("Legacy payments require only gasPrice.");
  } else {
    if (
      !r.maxFeePerGas ||
      r.maxPriorityFeePerGas === undefined ||
      r.gasPrice !== undefined ||
      BigInt(r.maxFeePerGas) === 0n ||
      BigInt(r.maxPriorityFeePerGas) > BigInt(r.maxFeePerGas)
    )
      throw new Error("Invalid EIP-1559 fees.");
  }
  if (r.kind === "native-disperse") checkDisperse(r);
  if (BigInt(r.gas) * BigInt(r.gasPrice ?? r.maxFeePerGas ?? "0") > MAX_UINT256)
    throw new Error("Fee exceeds uint256.");
  return Object.freeze(r);
}
async function accountFor(r: EvmRequest, seeds: SignerSeed[]) {
  for (const s of seeds) {
    if (s.fingerprint.toLowerCase() !== r.fp.toLowerCase()) continue;
    const root = HDKey.fromMasterSeed(await mnemonicToSeed(s.words, s.passphrase ?? ""));
    if (root.fingerprint.toString(16).padStart(8, "0") !== r.fp.toLowerCase()) continue;
    const key = root.derive(r.path);
    if (!key.privateKey) continue;
    const privateKey =
      `0x${Array.from(key.privateKey, (b) => b.toString(16).padStart(2, "0")).join("")}` as const;
    const account = privateKeyToAccount(privateKey);
    if (account.address.toLowerCase() === r.from.toLowerCase())
      return { account, seedName: s.name };
  }
  throw new Error("The EVM sender, fingerprint and path don't match any stored seed.");
}
export async function reviewEvm(text: string, seeds: SignerSeed[]): Promise<EvmReview> {
  const request = parseRequest(text);
  const { seedName } = await accountFor(request, seeds);
  const chain = CHAINS[request.chainId];
  const fee = BigInt(request.gas) * BigInt(request.gasPrice ?? request.maxFeePerGas ?? "0");
  const value = request.kind === "erc20-transfer" ? 0n : BigInt(request.value);
  const label = (v: bigint) =>
    chain ? `${formatUnits(v, 18)} ${chain.symbol}` : `${v} native base units`;
  const warnings: string[] = [];
  if (!chain)
    warnings.push(
      "Unlisted EVM network: verify the chain ID yourself. Amounts and fees are shown as raw native base units.",
    );
  if (request.kind === "erc20-transfer")
    warnings.push(
      "Token identity and decimals cannot be verified offline. Compare the contract address and raw token units; a contract may behave differently from a standard ERC-20.",
    );
  if (request.kind === "native-disperse")
    warnings.push(
      `Bulk payment to ${request.recipients.length} addresses through the pinned Disperse contract. Check every address and amount below.`,
    );
  if (value > 0n && fee * 20n > value)
    warnings.push("The maximum network fee is more than 5% of what you're sending.");
  return {
    request,
    seedName,
    chainName: chain?.name ?? "Unlisted EVM network",
    symbol: chain?.symbol ?? "native base units",
    amountLabel:
      request.kind === "erc20-transfer" ? `${request.amount} raw token units` : label(value),
    feeLabel: label(fee),
    totalLabel: label(value + fee),
    warnings,
    ...(request.kind === "native-disperse"
      ? {
          payouts: request.recipients.map((a, i) => ({
            address: getAddress(a),
            amountLabel: label(BigInt(request.values[i])),
          })),
        }
      : {}),
  };
}
export async function signEvm(
  review: EvmReview,
  seeds: SignerSeed[],
): Promise<{ hex: string; txid: string }> {
  const r = parseRequest(JSON.stringify(review.request));
  const { account } = await accountFor(r, seeds);
  const base = {
    chainId: r.chainId,
    nonce: r.nonce,
    gas: BigInt(r.gas),
    to: getAddress(r.kind === "erc20-transfer" ? r.token : r.to) as Address,
    value: r.kind === "erc20-transfer" ? 0n : BigInt(r.value),
    ...(r.kind === "native-disperse" ? { data: disperseCalldata(r.recipients, r.values) } : {}),
    ...(r.kind === "erc20-transfer"
      ? {
          data: encodeFunctionData({
            abi: TRANSFER_ABI,
            functionName: "transfer",
            args: [getAddress(r.to), BigInt(r.amount)],
          }),
        }
      : {}),
  };
  const tx: TransactionSerializable =
    r.type === "legacy"
      ? { ...base, type: "legacy", gasPrice: BigInt(r.gasPrice ?? "0") }
      : {
          ...base,
          type: "eip1559",
          maxFeePerGas: BigInt(r.maxFeePerGas ?? "0"),
          maxPriorityFeePerGas: BigInt(r.maxPriorityFeePerGas ?? "0"),
        };
  const signed = await account.signTransaction(tx);
  return { hex: signed, txid: keccak256(signed) };
}
