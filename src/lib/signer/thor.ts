/**
 * THORChain swap safety core: pinned tables, memo grammar and payout-address checks.
 * Nothing here fetches anything; every value the Vault needs is frozen in this file.
 */
import { address as baddress, payments } from "bitcoinjs-lib";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { NETWORKS, type CoinId } from "./networks";
import type { SignerSeed } from "./psbt";

/** How many first receiving addresses per seed are recognised as "this Vault's own". */
const OWN_ADDRESS_GAP = 10;

/** THORChain memos are limited to 80 bytes on every supported chain. */
export const THOR_MEMO_MAX_BYTES = 80;
/** Owner decision (Bobby, 28 Oct 2026): one trade only. Streaming memos such as /1/0 are refused. */
export const THOR_MEMO_SUFFIX = "/1/1";
/** Owner decision (Bobby, 2 Nov 2026): no affiliate or aggregator tag is ever accepted. */
export const MEMO_ACTIONS = ["=", "SWAP", "s"] as const;

export interface ThorChainInfo {
  name: string;
  symbol: string;
  router: string;
  /** Maximum gas × gas price (or maxFeePerGas) in that chain's native base units. */
  maxFeeWei: bigint;
}

/** Table 1.1 — the only permitted swap routers and chains. Anything else is refused. */
export const THOR_CHAINS: Readonly<Record<number, ThorChainInfo>> = Object.freeze({
  1: Object.freeze({
    name: "Ethereum",
    symbol: "ETH",
    router: "0xD37BbE5744D730a1d98d8DC97c42F0Ca46aD7146",
    maxFeeWei: 20_000_000_000_000_000n,
  }),
  8453: Object.freeze({
    name: "Base",
    symbol: "ETH",
    router: "0x00dc6100103BC402d490aEE3F9a5560cBd91f1d4",
    maxFeeWei: 2_000_000_000_000_000n,
  }),
  56: Object.freeze({
    name: "BNB Chain",
    symbol: "BNB",
    router: "0xb30ec53f98ff5947ede720d32ac2da7e52a5f56b",
    maxFeeWei: 20_000_000_000_000_000n,
  }),
});

export interface ThorTokenInfo {
  ticker: string;
  label: string;
  chainId: number;
  contract: string;
  decimals: number;
}

/** Table 1.2 — the only ERC-20 sources and token payouts. Decimals are pinned, never guessed. */
export const THOR_TOKENS: readonly ThorTokenInfo[] = Object.freeze([
  Object.freeze({
    ticker: "USDC",
    label: "USDC on Ethereum",
    chainId: 1,
    contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
  }),
  Object.freeze({
    ticker: "USDT",
    label: "USDT on Ethereum",
    chainId: 1,
    contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
  }),
  Object.freeze({
    ticker: "USDC",
    label: "USDC on Base",
    chainId: 8453,
    contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
  }),
  Object.freeze({
    ticker: "USDC",
    label: "USDC on BNB Chain",
    chainId: 56,
    contract: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    decimals: 18,
  }),
  Object.freeze({
    ticker: "USDT",
    label: "USDT on BNB Chain",
    chainId: 56,
    contract: "0x55d398326f99059fF775485246999027B3197955",
    decimals: 18,
  }),
]);

export type ThorPayout = "BTC" | "LTC" | "DOGE" | "EVM";

export interface ThorAsset {
  /** Canonical full memo form, e.g. "ETH.USDC-0xA0B8...". */
  field: string;
  label: string;
  payout: ThorPayout;
  /** Terse memo code for native coins (b/d/l/e/f/s); absent for tokens. */
  terseCode?: string;
  token?: ThorTokenInfo;
}

interface AssetForm {
  asset: ThorAsset;
  /** Terse single-letter code (b/d/l/e/f/s) — only meaningful for UTXO sources. */
  terse: boolean;
  /** Short token name without the contract, e.g. "ETH.USDC" — UTXO sources only (80-byte limit). */
  utxoOnly: boolean;
}

const NATIVES: readonly { field: string; label: string; payout: ThorPayout; terse: string }[] =
  Object.freeze([
    { field: "BTC.BTC", label: "Bitcoin", payout: "BTC", terse: "b" },
    { field: "LTC.LTC", label: "Litecoin", payout: "LTC", terse: "l" },
    { field: "DOGE.DOGE", label: "Dogecoin", payout: "DOGE", terse: "d" },
    { field: "ETH.ETH", label: "Ether on Ethereum", payout: "EVM", terse: "e" },
    { field: "BASE.ETH", label: "Ether on Base", payout: "EVM", terse: "f" },
    { field: "BSC.BNB", label: "BNB on BNB Chain", payout: "EVM", terse: "s" },
  ]);

/** Chain prefix used in every THORChain memo asset field for an EVM chain. */
export const CHAIN_PREFIX: Readonly<Record<number, string>> = Object.freeze({
  1: "ETH",
  8453: "BASE",
  56: "BSC",
});

const ASSETS: ThorAsset[] = [
  ...NATIVES.map((n) =>
    Object.freeze({
      field: n.field,
      label: n.label,
      payout: n.payout,
      terseCode: n.terse,
    }),
  ),
  ...THOR_TOKENS.map((t) =>
    Object.freeze({
      field: `${CHAIN_PREFIX[t.chainId]}.${t.ticker}-${t.contract.toUpperCase()}`,
      label: t.label,
      payout: "EVM" as ThorPayout,
      token: t,
    }),
  ),
];

/** Memo field → asset. Built once from the pinned tables; unknown fields are refused. */
const FORMS: ReadonlyMap<string, AssetForm> = (() => {
  const map = new Map<string, AssetForm>();
  const add = (field: string, asset: ThorAsset, terse = false, utxoOnly = false) =>
    map.set(field.toUpperCase(), { asset, terse, utxoOnly });
  for (const n of NATIVES) {
    const asset = ASSETS.find((a) => a.field === n.field)!;
    add(n.field, asset);
    add(n.terse, asset, true);
  }
  for (const t of THOR_TOKENS) {
    const asset = ASSETS.find((a) => a.token === t)!;
    const chainPrefix = t.chainId === 1 ? "ETH" : t.chainId === 8453 ? "BASE" : "BSC";
    add(`${chainPrefix}.${t.ticker}-${t.contract.toUpperCase()}`, asset);
    add(`${chainPrefix}.${t.ticker}`, asset, false, true);
  }
  return map;
})();

export function resolveThorAssetField(field: string): AssetForm | null {
  return FORMS.get(field.trim().toUpperCase()) ?? null;
}

/** Native coin of a chain, used to check `quote.from` for native sources. */
export function nativeAssetForChain(chainId: number): ThorAsset | null {
  const field = chainId === 1 ? "ETH.ETH" : chainId === 8453 ? "BASE.ETH" : chainId === 56 ? "BSC.BNB" : null;
  return field ? (ASSETS.find((a) => a.field === field) ?? null) : null;
}

export function tokenForContract(contract: string): ThorTokenInfo | null {
  const want = contract.trim().toLowerCase();
  return THOR_TOKENS.find((t) => t.contract.toLowerCase() === want) ?? null;
}

/**
 * The asset a swap spends: the chain's own native coin or a pinned token on that chain.
 * Terse codes and short token names are never accepted as a source, so the contract is always known.
 */
export function resolveThorSource(chainId: number, from: string): ThorAsset | null {
  const want = from.trim();
  const token = tokenForContract(want);
  if (token) return token.chainId === chainId ? (ASSETS.find((a) => a.token === token) ?? null) : null;
  const form = FORMS.get(want.toUpperCase());
  if (!form || form.terse || form.utxoOnly) return null;
  const asset = form.asset;
  if (asset.token) return asset.token.chainId === chainId ? asset : null;
  return nativeAssetForChain(chainId)?.field === asset.field ? asset : null;
}

/** THORChain always expresses payout minimums in 1e8 units of the payout asset. */
export function format1e8(v: bigint): string {
  const neg = v < 0n,
    x = neg ? -v : v;
  const frac = (x % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${x / 100_000_000n}${frac ? "." + frac : ""}`;
}

function refuse(message: string): never {
  throw new Error(`Signing blocked: ${message}`);
}

/** Read an OP_RETURN payload as text, or null when it isn't a plain single-push byte string. */
export function decodeThorMemoOutput(script: Uint8Array): string | null {
  if (script[0] !== 0x6a) return null;
  let payload: Uint8Array;
  if (script[1] === 0x4c) {
    if (script.length !== 3 + script[2]) return null;
    payload = script.subarray(3);
  } else if (script[1] <= 75) {
    if (script.length !== 2 + script[1]) return null;
    payload = script.subarray(2);
  } else return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(payload);
  } catch {
    return null;
  }
}

/** True when the output carries a memo this Vault would accept as a swap instruction. */
export function isThorMemoOutput(script: Uint8Array): boolean {
  const text = decodeThorMemoOutput(script);
  if (!text) return false;
  try {
    parseThorMemo(text);
    return true;
  } catch {
    return false;
  }
}

/** A payout destination must be a real address on the payout asset's own chain. */
export function isValidThorDestination(payout: ThorPayout, destination: string): boolean {
  const dest = destination.trim();
  if (!dest) return false;
  if (payout === "EVM") {
    if (!/^0x[0-9a-fA-F]{40}$/.test(dest)) return false;
    try {
      return getAddress(dest) !== "0x0000000000000000000000000000000000000000";
    } catch {
      return false;
    }
  }
  try {
    baddress.toOutputScript(dest, NETWORKS[payout]);
    return true;
  } catch {
    return false;
  }
}

export interface ThorMemo {
  action: string;
  /** Memo field exactly as scanned. */
  field: string;
  asset: ThorAsset;
  /** True when the memo used a terse code or a short token name (UTXO sources only). */
  shorthand: boolean;
  destination: string;
  /** Minimum payout in 1e8 units of the payout asset. */
  minimumOut: bigint;
  bytes: number;
}

/**
 * Section 2.2 grammar: `<action>:<asset>:<destination>:<minimum>/1/1`.
 * Exactly four fields — affiliate, aggregator or any other extra field is refused.
 * When `fullForms` is set (EVM sources), terse codes and short token names are refused.
 */
export function parseThorMemo(memo: string, opts: { fullForms?: boolean } = {}): ThorMemo {
  const bytes = new TextEncoder().encode(memo).length;
  if (bytes > THOR_MEMO_MAX_BYTES) refuse("the swap memo is longer than 80 bytes.");
  // Keep the review screen display-safe: no control characters or line breaks.
  if (!/^[\x20-\x7e]+$/.test(memo)) refuse("the swap memo contains unreadable characters.");
  const parts = memo.split(":");
  if (parts.length !== 4)
    refuse(
      "the swap memo must have exactly four fields; extra fields such as an affiliate or aggregator tag are refused.",
    );
  const [action, field, rawDestination, limit] = parts;
  if (!MEMO_ACTIONS.includes(action as (typeof MEMO_ACTIONS)[number]))
    refuse(`"${action}" is not a recognised swap command.`);
  const found = resolveThorAssetField(field);
  if (!found) refuse(`"${field}" is an unknown payout asset.`);
  if (opts.fullForms && (found.terse || found.utxoOnly))
    refuse("EVM swaps must name the payout asset in full, including its contract.");
  const destination = rawDestination.trim();
  if (!isValidThorDestination(found.asset.payout, destination))
    refuse(`the payout address is not a valid ${found.asset.label} address.`);
  const m = /^(0|[1-9][0-9]*)\/([0-9]+)\/([0-9]+)$/.exec(limit);
  if (!m) {
    if (!limit.includes("/")) refuse("the swap memo states no payout minimum.");
    refuse("the swap memo's trade count is unreadable.");
  }
  if (m[1] === "0") refuse("the swap memo's payout minimum must be positive.");
  if (m[2] !== "1" || m[3] !== "1")
    refuse(
      `only a single-trade swap (…${THOR_MEMO_SUFFIX}) is accepted; streaming memos are refused.`,
    );
  return Object.freeze({
    action,
    field: field.trim(),
    asset: found.asset,
    shorthand: found.terse || found.utxoOnly,
    destination,
    minimumOut: BigInt(m[1]),
    bytes,
  });
}

/** The coin a UTXO PSBT spends, in its canonical memo form. */
const UTXO_SOURCE: Partial<Record<CoinId, string>> = {
  BTC: "BTC.BTC",
  LTC: "LTC.LTC",
  DOGE: "DOGE.DOGE",
};

export interface UtxoSwapShape {
  /** Verified output list in PSBT order, data output included. */
  outputs: { isData: boolean; isChange: boolean; sats: bigint }[];
  /** Index of the single OP_RETURN output. */
  dataVout: number;
  /** True when the change output pays the address of input 0. */
  changePaysFirstInput: boolean;
}

/**
 * Section 2.1 accepted UTXO shape. Returns a refusal message, or null when the shape is safe.
 * Deposit is output 0, change (optional) is output 1 and must return to input 0, memo is last.
 */
export function utxoSwapProblem(coin: CoinId, memo: ThorMemo, shape: UtxoSwapShape): string | null {
  const source = UTXO_SOURCE[coin];
  if (!source)
    return `${coin} does not support THORChain swaps in this Vault; only BTC, LTC and DOGE do.`;
  const { outputs, dataVout } = shape;
  if (dataVout !== outputs.length - 1)
    return "the swap memo must be the last output in the payment.";
  if (outputs.length < 2 || outputs.length > 3)
    return "a swap payment must have a deposit output, the memo, and at most one change output.";
  if (outputs[0].isData || outputs[0].sats <= 0n)
    return "the first output must be the THORChain deposit with a positive amount.";
  if (outputs.length === 3) {
    if (!outputs[1].isChange)
      return "the second output must be change that this Vault can verify as your own.";
    if (!shape.changePaysFirstInput)
      return "swap change must return to the address of the first input, where refunds go.";
  }
  if (memo.asset.field === source)
    return "a swap must pay out a different asset than the one it spends.";
  return null;
}

/**
 * True when `address` is one of this Vault's own first receiving addresses on the payout chain.
 * Used only for a disclosure warning; a false result never blocks signing.
 */
export async function vaultOwnsAddress(
  seeds: SignerSeed[],
  payout: ThorPayout,
  address: string,
  roots: Map<string, HDKey>,
): Promise<boolean> {
  const want = address.trim().toLowerCase();
  if (!want) return false;
  for (const s of seeds) {
    let root = roots.get(s.id);
    if (!root) {
      root = HDKey.fromMasterSeed(await mnemonicToSeed(s.words, s.passphrase ?? ""));
      roots.set(s.id, root);
    }
    if (payout === "EVM") {
      for (let i = 0; i < OWN_ADDRESS_GAP; i++) {
        const key = root.derive(`m/44'/60'/0'/0/${i}`);
        if (!key.privateKey) continue;
        const hex = `0x${Array.from(key.privateKey, (b) => b.toString(16).padStart(2, "0")).join("")}` as const;
        if (privateKeyToAccount(hex).address.toLowerCase() === want) return true;
      }
      continue;
    }
    const ct = payout === "BTC" ? 0 : payout === "LTC" ? 2 : 3;
    for (let i = 0; i < OWN_ADDRESS_GAP; i++) {
      const key = root.derive(`m/44'/${ct}'/0'/0/${i}`);
      const script = key.publicKey ? payments.p2pkh({ pubkey: key.publicKey, network: NETWORKS[payout] }).output : undefined;
      if (!script) continue;
      try {
        if (baddress.fromOutputScript(script, NETWORKS[payout]).toLowerCase() === want) return true;
      } catch {
        /* address form not usable on this coin */
      }
    }
  }
  return false;
}
