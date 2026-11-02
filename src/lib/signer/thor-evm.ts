/**
 * `hm-thor-swap` v1: THORChain swap preparation for EVM sources (Ethereum, Base, BNB Chain).
 * The supplied calldata is never trusted: the Vault rebuilds it from the quote and requires an
 * exact byte-for-byte match before anything is shown or signed. No RPC, no fetching.
 */
import { z } from "zod";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
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
import { THOR_CHAINS, format1e8, parseThorMemo, resolveThorSource, type ThorAsset } from "./thor";

const MAX_UINT256 = (1n << 256n) - 1n;
const uint = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,77})$/)
  .refine((v) => BigInt(v) <= MAX_UINT256, "Quantity exceeds uint256.");
const address = z.string().refine((s) => {
  try {
    return (
      getAddress(s) !== "0x0000000000000000000000000000000000000000" &&
      /^0x[0-9a-fA-F]{40}$/.test(s)
    );
  } catch {
    return false;
  }
}, "Invalid or zero address.");
/** THORChain expiry/quantity fields arrive as decimal strings or plain numbers. */
const quantity = z.union([uint, z.number().int().nonnegative()]);
const asBigInt = (v: string | number): bigint => BigInt(v);

const quoteSchema = z
  .object({
    provider: z.literal("thorchain"),
    from: z.string().min(1).max(80),
    to: z.string().min(1).max(80),
    rawIn: uint,
    amountIn: uint,
    destination: z.string().min(1).max(120),
    inbound: address,
    router: address,
    memo: z.string().min(1).max(200),
    expiry: quantity,
    expectedOut: uint,
    minimumOut: uint,
    feeOut: uint,
    seconds: z.number().int().min(0).max(1_000_000),
    toleranceBps: z.number().int().min(0).max(10_000),
    quotedAt: z.union([z.string().max(64), z.number()]),
  })
  .strict();

const transactionSchema = z
  .object({
    from: address,
    chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    nonce: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    to: address,
    value: uint,
    data: z.string().regex(/^0x([0-9a-fA-F]{2})*$/),
    gas: uint,
    type: z.enum(["legacy", "eip1559"]),
    gasPrice: uint.optional(),
    maxFeePerGas: uint.optional(),
    maxPriorityFeePerGas: uint.optional(),
  })
  .strict();

const swapSchema = z
  .object({
    format: z.literal("hm-thor-swap"),
    v: z.literal(1),
    fp: z.string().regex(/^[0-9a-fA-F]{8}$/),
    path: z.string().regex(/^m\/44'\/60'\/(0|[1-9][0-9]{0,5})'\/0\/(0|[1-9][0-9]{0,5})$/),
    action: z.enum(["approval-reset", "approval", "evm-deposit"]),
    quote: quoteSchema,
    transaction: transactionSchema,
  })
  .strict();

export type ThorSwapRequest = z.infer<typeof swapSchema>;

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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface ThorSwapReview {
  request: ThorSwapRequest;
  seedName: string;
  chainName: string;
  symbol: string;
  actionLabel: string;
  amountLabel: string;
  payoutLabel: string;
  destination: string;
  depositAddress: string;
  expiryLabel: string;
  feeLabel: string;
  warnings: string[];
}

function refuse(message: string): never {
  throw new Error(`Signing blocked: ${message}`);
}

function parseSwap(text: string): ThorSwapRequest {
  if (text.length > 8192) refuse("the swap request is too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That isn't a THORChain swap QR.");
  }
  const result = swapSchema.safeParse(parsed);
  if (!result.success)
    refuse(
      "this THORChain swap request is malformed, carries an unknown field, or uses an unsupported version.",
    );
  return Object.freeze(result.data);
}

/** Section 3.1 check 4: rebuild the only calldata this Vault will ever sign. */
function expectedCall(request: ThorSwapRequest, source: ThorAsset) {
  const { quote, action } = request;
  const router = getAddress(quote.router);
  const inbound = getAddress(quote.inbound);
  const rawIn = BigInt(quote.rawIn);
  const expiry = asBigInt(quote.expiry);
  if (action === "approval-reset" || action === "approval") {
    const token = source.token;
    if (!token) refuse("allowance requests must name a token, not a native coin.");
    return {
      to: getAddress(token!.contract),
      value: 0n,
      data: encodeFunctionData({
        abi: APPROVE_ABI,
        functionName: "approve",
        args: [router, action === "approval" ? rawIn : 0n],
      }),
    };
  }
  return {
    to: router,
    value: source.token ? 0n : rawIn,
    data: encodeFunctionData({
      abi: DEPOSIT_ABI,
      functionName: "depositWithExpiry",
      args: [
        inbound,
        getAddress(source.token?.contract ?? ZERO_ADDRESS),
        rawIn,
        quote.memo,
        expiry,
      ],
    }),
  };
}

async function accountFor(request: ThorSwapRequest, seeds: SignerSeed[]) {
  for (const s of seeds) {
    if (s.fingerprint.toLowerCase() !== request.fp.toLowerCase()) continue;
    const root = HDKey.fromMasterSeed(await mnemonicToSeed(s.words, s.passphrase ?? ""));
    if (root.fingerprint.toString(16).padStart(8, "0") !== request.fp.toLowerCase()) continue;
    const key = root.derive(request.path);
    if (!key.privateKey) continue;
    const privateKey =
      `0x${Array.from(key.privateKey, (b) => b.toString(16).padStart(2, "0")).join("")}` as const;
    const account = privateKeyToAccount(privateKey);
    if (account.address.toLowerCase() === request.transaction.from.toLowerCase())
      return { account, seedName: s.name };
  }
  refuse("the swap sender, fingerprint and path don't match any stored seed.");
}

/** Every check from section 3.1. Returns the verified pieces the review screen needs. */
function verify(request: ThorSwapRequest) {
  const { quote, transaction: tx } = request;
  const chain = THOR_CHAINS[tx.chainId];
  if (!chain) refuse(`chain ID ${tx.chainId} is not a supported THORChain swap network.`);
  if (getAddress(quote.router) !== getAddress(chain!.router))
    refuse(`the router is not the pinned ${chain!.name} THORChain router.`);
  if (getAddress(tx.to) !== getAddress(quote.router) && request.action === "evm-deposit")
    refuse("a swap deposit must pay the pinned router.");

  // The source asset must be that chain's native coin or a pinned token on that chain.
  const source = resolveThorSource(tx.chainId, quote.from);
  if (!source) refuse(`"${quote.from}" is not a supported ${chain!.name} swap source.`);

  if (tx.type === "legacy") {
    if (
      !tx.gasPrice ||
      BigInt(tx.gasPrice) === 0n ||
      tx.maxFeePerGas !== undefined ||
      tx.maxPriorityFeePerGas !== undefined
    )
      refuse("legacy swap fees require only gasPrice.");
  } else if (
    !tx.maxFeePerGas ||
    tx.maxPriorityFeePerGas === undefined ||
    tx.gasPrice !== undefined ||
    BigInt(tx.maxFeePerGas) === 0n ||
    BigInt(tx.maxPriorityFeePerGas) > BigInt(tx.maxFeePerGas)
  )
    refuse("invalid EIP-1559 swap fees.");

  const fee = BigInt(tx.gas) * BigInt(tx.gasPrice ?? tx.maxFeePerGas ?? "0");
  if (fee > chain!.maxFeeWei)
    refuse(
      `the maximum network fee exceeds Vault's ${chain!.name} swap limit of ${formatUnits(
        chain!.maxFeeWei,
        18,
      )} ${chain!.symbol}.`,
    );

  const memo = parseThorMemo(quote.memo, { fullForms: true });
  if (quote.destination.trim().toLowerCase() !== memo.destination.toLowerCase())
    refuse("the quoted payout address differs from the swap memo.");
  if (asBigInt(quote.minimumOut) !== memo.minimumOut)
    refuse("the quoted payout minimum differs from the swap memo.");
  if (quote.to.trim().toUpperCase() !== memo.asset.field)
    refuse("the quoted payout asset differs from the swap memo.");

  const expiry = asBigInt(quote.expiry);
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (expiry <= now) refuse("this swap quote has already expired. Ask for a fresh one.");
  if (expiry > now + 3600n) refuse("this swap quote expires more than one hour ahead.");

  const expected = expectedCall(request, source);
  if (getAddress(tx.to) !== expected.to)
    refuse("the swap target differs from the rebuilt request.");
  if (BigInt(tx.value) !== expected.value)
    refuse("the swap value differs from the rebuilt request.");
  if (tx.data.toLowerCase() !== expected.data.toLowerCase())
    refuse("the swap calldata differs from the rebuilt request, byte for byte.");

  return { chain: chain!, source, memo, fee, expiry, expected };
}

export async function reviewThorSwap(text: string, seeds: SignerSeed[]): Promise<ThorSwapReview> {
  const request = parseSwap(text);
  const { seedName } = await accountFor(request, seeds);
  const { chain, source, memo, fee, expiry } = verify(request);
  const warnings: string[] = [];
  if (source.token)
    warnings.push(
      `THORChain pools are identified by name here. Compare the contract ${source.token.contract} with Honest Money before signing.`,
    );
  warnings.push(
    "Compare the THORChain deposit address with the address shown in Honest Money. This offline phone cannot verify it.",
  );
  warnings.push(
    "A failed swap returns your coins to the sending address shown above; this Vault cannot check pool state offline.",
  );
  const native = source.token ? null : source;
  const amountLabel = source.token
    ? `${formatUnits(BigInt(request.quote.rawIn), source.token.decimals)} ${source.token.ticker}`
    : `${formatUnits(BigInt(request.quote.rawIn), 18)} ${chain.symbol}`;
  const actionLabel =
    request.action === "approval-reset"
      ? `Reset ${source.token?.ticker ?? "token"} allowance to zero for the THORChain router`
      : request.action === "approval"
        ? `Allow the THORChain router to spend exactly ${amountLabel}`
        : `Deposit ${amountLabel} to THORChain: swap for at least ${format1e8(memo.minimumOut)} ${memo.asset.label}`;
  return {
    request,
    seedName,
    chainName: chain.name,
    symbol: chain.symbol,
    actionLabel,
    amountLabel: native ? amountLabel : amountLabel,
    payoutLabel: `at least ${format1e8(memo.minimumOut)} ${memo.asset.label}`,
    destination: memo.destination,
    depositAddress: request.quote.inbound,
    expiryLabel: new Date(Number(expiry) * 1000).toISOString().replace("T", " ").slice(0, 19),
    feeLabel: `${formatUnits(fee, 18)} ${chain.symbol}`,
    warnings,
  };
}

export async function signThorSwap(
  review: ThorSwapReview,
  seeds: SignerSeed[],
): Promise<{ hex: string; txid: string }> {
  // Re-validate everything, including the clock, before a single byte is signed.
  const request = parseSwap(JSON.stringify(review.request));
  const { account } = await accountFor(request, seeds);
  const { expected } = verify(request);
  const tx = request.transaction;
  const base = {
    chainId: tx.chainId,
    nonce: tx.nonce,
    gas: BigInt(tx.gas),
    to: expected.to as Address,
    value: expected.value,
    data: expected.data,
  };
  const serializable: TransactionSerializable =
    tx.type === "legacy"
      ? { ...base, type: "legacy", gasPrice: BigInt(tx.gasPrice ?? "0") }
      : {
          ...base,
          type: "eip1559",
          maxFeePerGas: BigInt(tx.maxFeePerGas ?? "0"),
          maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas ?? "0"),
        };
  const signed = await account.signTransaction(serializable);
  return { hex: signed, txid: keccak256(signed) };
}
