/**
 * Batch sweep signing (`hm-evm-tx` kind `sweep-batch`): many ordinary native/ERC-20 transfers from
 * this seed's own m/44'/60'/0'/0/i addresses to ONE destination, approved once. Every item passes the
 * single-payment validator and its transaction is rebuilt locally; nothing supplied as calldata is signed.
 */
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import {
  bytesToHex,
  formatUnits,
  getAddress,
  keccak256,
  stringToBytes,
  hexToBytes,
  type Hex,
} from "viem";
import { privateKeyToAccount, publicKeyToAddress, type PrivateKeyAccount } from "viem/accounts";
import { secp256k1 } from "@noble/curves/secp256k1";
import { checkEvmRequest, buildEvmTx, EVM_FEE_CEILINGS, type EvmRequest } from "./evm";
import type { SignerSeed } from "./psbt";

export const SWEEP_MAX_ITEMS = 25;
export const SWEEP_MAX_INDEX = 999;
export const SWEEP_MAX_TEXT = 32_768;
export const SWEEP_CHAINS: Record<number, { name: string; symbol: string }> = {
  1: { name: "Ethereum", symbol: "ETH" },
  56: { name: "BNB Smart Chain", symbol: "BNB" },
  8453: { name: "Base", symbol: "ETH" },
  90031273: { name: "Zero Chill", symbol: "ZCU" },
};
/** Whole-batch fee ceiling = 5 × the single-payment ceiling pinned in `EVM_FEE_CEILINGS`. */
export const SWEEP_TOTAL_FEE_MULTIPLIER = 5n;
const NATIVE_GAS = 21_000n;
const TOKEN_GAS_MIN = 30_000n;
const TOKEN_GAS_MAX = 200_000n;
const PATH = /^m\/44'\/60'\/0'\/0\/(0|[1-9][0-9]{0,2})$/;
const ENVELOPE_KEYS = ["format", "v", "kind", "fp", "chainId", "destination", "items"];
const ITEM_FORBIDDEN = ["format", "v", "fp", "chainId"];

/** Curated, pinned stablecoins for readable amounts. Anything else is shown as an unknown token. */
export const SWEEP_TOKENS: readonly {
  chainId: number;
  contract: string;
  ticker: string;
  decimals: number;
}[] = Object.freeze([
  {
    chainId: 1,
    contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    ticker: "USDC",
    decimals: 6,
  },
  {
    chainId: 1,
    contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ticker: "USDT",
    decimals: 6,
  },
  {
    chainId: 1,
    contract: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    ticker: "DAI",
    decimals: 18,
  },
  {
    chainId: 56,
    contract: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    ticker: "USDC",
    decimals: 18,
  },
  {
    chainId: 56,
    contract: "0x55d398326f99059fF775485246999027B3197955",
    ticker: "USDT",
    decimals: 18,
  },
  {
    chainId: 56,
    contract: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
    ticker: "DAI",
    decimals: 18,
  },
  {
    chainId: 8453,
    contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    ticker: "USDC",
    decimals: 6,
  },
  {
    chainId: 8453,
    contract: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    ticker: "DAI",
    decimals: 18,
  },
]);

export interface SweepRow {
  index: number;
  from: string;
  nonce: number;
  asset: string;
  amountLabel: string;
  feeLabel: string;
  /** Native rows only: amount + maximum fee, which the wallet computed as "everything minus fee". */
  spendLabel?: string;
  unknownToken: boolean;
}
export interface SweepReview {
  /** Exact received text; signing re-validates it and the reply hash covers these bytes. */
  text: string;
  seedName: string;
  chainName: string;
  destination: string;
  /** Index k when the destination is this seed's own m/44'/60'/0'/0/k address; otherwise null (external). */
  ownIndex: number | null;
  rows: SweepRow[];
  totals: { asset: string; amountLabel: string }[];
  totalFeeLabel: string;
  warnings: string[];
}

const fail = (m: string): never => {
  throw new Error(`Batch sweep refused: ${m}`);
};

interface Parsed {
  fp: string;
  chainId: number;
  destination: string;
  items: EvmRequest[];
}

export function parseSweep(text: string): Parsed {
  if (text.length > SWEEP_MAX_TEXT) fail("the request is too large.");
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text);
  } catch {
    return fail("that isn't a batch sweep QR.");
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) fail("malformed request.");
  if (Object.keys(o).some((k) => !ENVELOPE_KEYS.includes(k)))
    fail("unknown fields in the request.");
  if (o.format !== "hm-evm-tx" || o.v !== 1 || o.kind !== "sweep-batch")
    fail("not a v1 batch sweep.");
  if (typeof o.fp !== "string" || !/^[0-9a-fA-F]{8}$/.test(o.fp)) fail("missing seed fingerprint.");
  if (typeof o.chainId !== "number" || !SWEEP_CHAINS[o.chainId]) fail("unsupported network.");
  if (typeof o.destination !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(o.destination))
    fail("invalid destination.");
  let destination = "";
  try {
    destination = getAddress(o.destination as string);
  } catch {
    fail("invalid destination checksum.");
  }
  if (o.destination !== destination && o.destination !== (o.destination as string).toLowerCase())
    fail("invalid destination checksum.");
  if (destination === "0x0000000000000000000000000000000000000000") fail("invalid destination.");
  if (!Array.isArray(o.items) || o.items.length < 1 || o.items.length > SWEEP_MAX_ITEMS)
    fail(`a batch must have 1–${SWEEP_MAX_ITEMS} payments.`);
  const fp = o.fp as string;
  const chainId = o.chainId as number;
  const items = (o.items as unknown[]).map((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return fail(`item ${i + 1} is malformed.`);
    if (ITEM_FORBIDDEN.some((k) => k in (raw as object)))
      fail(`item ${i + 1} repeats envelope fields.`);
    let r: EvmRequest;
    try {
      r = checkEvmRequest({ ...(raw as object), format: "hm-evm-tx", v: 1, fp, chainId });
    } catch (e) {
      return fail(`item ${i + 1}: ${(e as Error).message}`);
    }
    if (r.kind !== "native-transfer" && r.kind !== "erc20-transfer")
      fail(`item ${i + 1} is not a plain coin or token transfer.`);
    if (!PATH.test(r.path)) fail(`item ${i + 1} path must be m/44'/60'/0'/0/0–${SWEEP_MAX_INDEX}.`);
    if (getAddress(r.to) !== destination) fail(`item ${i + 1} pays a different address.`);
    if (getAddress(r.from) === destination)
      fail("the destination is one of the sending addresses.");
    const gas = BigInt(r.gas);
    if (r.kind === "native-transfer" && gas !== NATIVE_GAS)
      fail(`item ${i + 1} gas must be 21,000.`);
    if (r.kind === "erc20-transfer") {
      if (gas < TOKEN_GAS_MIN || gas > TOKEN_GAS_MAX) fail(`item ${i + 1} token gas out of range.`);
      if (getAddress(r.token) === destination)
        fail(`item ${i + 1} token contract is the destination.`);
    }
    return r;
  });
  // Per-address order: consecutive nonces in batch order, tokens first, at most one native, native last.
  const byFrom = new Map<string, EvmRequest[]>();
  for (const r of items) {
    const k = getAddress(r.from);
    byFrom.set(k, [...(byFrom.get(k) ?? []), r]);
  }
  for (const [from, list] of byFrom) {
    const paths = new Set(list.map((r) => r.path));
    if (paths.size !== 1) fail(`address ${from} appears with different paths.`);
    const assets = new Set<string>();
    list.forEach((r, j) => {
      if (j > 0 && r.nonce !== list[j - 1].nonce + 1)
        fail(`nonces for ${from} must be consecutive and in order.`);
      const asset = r.kind === "erc20-transfer" ? getAddress(r.token) : "native";
      if (assets.has(asset)) fail(`${from} sends the same asset twice.`);
      assets.add(asset);
      if (r.kind === "native-transfer" && j !== list.length - 1)
        fail(`the coin payment from ${from} must come after its token payments.`);
    });
  }
  return { fp, chainId, destination, items };
}

const fee = (r: EvmRequest) => BigInt(r.gas) * BigInt(r.gasPrice ?? r.maxFeePerGas ?? "0");

async function sweepAccounts(p: Parsed, seeds: SignerSeed[]) {
  for (const s of seeds) {
    if (s.fingerprint.toLowerCase() !== p.fp.toLowerCase()) continue;
    const root = HDKey.fromMasterSeed(await mnemonicToSeed(s.words, s.passphrase ?? ""));
    if (root.fingerprint.toString(16).padStart(8, "0") !== p.fp.toLowerCase()) continue;
    const branch = root.derive("m/44'/60'/0'/0");
    // Public-only branch: reviewing a batch never materialises a private key (auditor 2026-11-17).
    const pubOnly = HDKey.fromExtendedKey(branch.publicExtendedKey);
    const publicAddress = (i: number): string => {
      const point = pubOnly.deriveChild(i).publicKey;
      if (!point) return fail("key derivation failed.");
      return publicKeyToAddress(
        bytesToHex(secp256k1.ProjectivePoint.fromHex(point).toRawBytes(false)),
      );
    };
    const account = (i: number): PrivateKeyAccount => {
      const k = branch.deriveChild(i).privateKey;
      if (!k) return fail("key derivation failed.");
      return privateKeyToAccount(
        `0x${Array.from(k, (b) => b.toString(16).padStart(2, "0")).join("")}`,
      );
    };
    for (const r of p.items) {
      const index = Number(r.path.split("/").pop());
      if (publicAddress(index) !== getAddress(r.from))
        fail(`sender ${r.from} isn't ${r.path} on this seed.`);
    }
    return { seedName: s.name, account, publicAddress };
  }
  return fail("no stored seed matches this fingerprint.");
}

export async function reviewSweep(text: string, seeds: SignerSeed[]): Promise<SweepReview> {
  const p = parseSweep(text);
  const { seedName, publicAddress } = await sweepAccounts(p, seeds);
  const chain = SWEEP_CHAINS[p.chainId];
  const totalFee = p.items.reduce((t, r) => t + fee(r), 0n);
  const ceiling = EVM_FEE_CEILINGS[p.chainId]?.maxFeeWei;
  if (ceiling !== undefined && totalFee > ceiling * SWEEP_TOTAL_FEE_MULTIPLIER)
    fail(
      `total maximum fee exceeds Vault's batch limit of ${formatUnits(ceiling * SWEEP_TOTAL_FEE_MULTIPLIER, 18)} ${chain.symbol}.`,
    );
  let ownIndex: number | null = null;
  for (let i = 0; i <= SWEEP_MAX_INDEX && ownIndex === null; i++)
    if (publicAddress(i) === p.destination) ownIndex = i;
  const native = (v: bigint) => `${formatUnits(v, 18)} ${chain.symbol}`;
  const totals = new Map<string, { label: (v: bigint) => string; sum: bigint }>();
  let unknown = false;
  const rows: SweepRow[] = p.items.map((r) => {
    const f = fee(r);
    const index = Number(r.path.split("/").pop());
    if (r.kind === "native-transfer") {
      const v = BigInt(r.value);
      const t = totals.get(chain.symbol) ?? { label: native, sum: 0n };
      totals.set(chain.symbol, { ...t, sum: t.sum + v });
      return {
        index,
        from: getAddress(r.from),
        nonce: r.nonce,
        asset: chain.symbol,
        amountLabel: native(v),
        feeLabel: native(f),
        spendLabel: native(v + f),
        unknownToken: false,
      };
    }
    const contract = getAddress((r as Extract<EvmRequest, { kind: "erc20-transfer" }>).token);
    const amount = BigInt((r as Extract<EvmRequest, { kind: "erc20-transfer" }>).amount);
    const known = SWEEP_TOKENS.find((t) => t.chainId === p.chainId && t.contract === contract);
    const asset = known ? `${known.ticker} (${contract})` : `Unknown token ${contract}`;
    const label = (v: bigint) =>
      known ? `${formatUnits(v, known.decimals)} ${known.ticker}` : `${v} raw units`;
    if (!known) unknown = true;
    const t = totals.get(asset) ?? { label, sum: 0n };
    totals.set(asset, { ...t, sum: t.sum + amount });
    return {
      index,
      from: getAddress(r.from),
      nonce: r.nonce,
      asset,
      amountLabel: label(amount),
      feeLabel: native(f),
      unknownToken: !known,
    };
  });
  const warnings = [
    "The online wallet computed each coin amount as \u201ceverything minus the maximum fee\u201d. This offline phone can't see balances; if a balance moved, that payment fails without loss.",
  ];
  if (ownIndex === null)
    warnings.push(
      "The destination is NOT one of this seed's first 1,000 addresses. Make sure you recognise it.",
    );
  if (unknown)
    warnings.push(
      "Some tokens are unknown to Vault: compare the contract address and raw units yourself.",
    );
  if (ceiling === undefined)
    warnings.push(`${chain.name} has no fixed fee limit in Vault. Check the total fee carefully.`);
  return {
    text,
    seedName,
    chainName: chain.name,
    destination: p.destination,
    ownIndex,
    rows,
    totals: [...totals].map(([asset, t]) => ({ asset, amountLabel: t.label(t.sum) })),
    totalFeeLabel: native(totalFee),
    warnings,
  };
}

const toBase64 = (hex: Hex) => {
  let s = "";
  for (const b of hexToBytes(hex)) s += String.fromCharCode(b);
  return btoa(s);
};

/** keccak256 over the exact UTF-8 request bytes received (auditor C3). */
export const sweepIntentHash = (text: string) => keccak256(stringToBytes(text));

/** Re-validates the reviewed bytes, signs every item locally and returns the `hm-evm-signed-batch` reply. */
export async function signSweep(review: SweepReview, seeds: SignerSeed[]): Promise<string> {
  const p = parseSweep(review.text);
  const { account } = await sweepAccounts(p, seeds);
  const signed: string[] = [];
  for (const r of p.items)
    signed.push(
      toBase64(await account(Number(r.path.split("/").pop())).signTransaction(buildEvmTx(r))),
    );
  if (new Set(signed).size !== signed.length) fail("duplicate signed transaction.");
  return JSON.stringify({
    format: "hm-evm-signed-batch",
    v: 1,
    intentHash: sweepIntentHash(review.text),
    signed,
  });
}
