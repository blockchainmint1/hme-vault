/**
 * Plain-language hint when a scanned payment belongs to a different network than the one
 * picked on the Sign screen. Display-only: it runs before parsing and only replaces one
 * refusal with a clearer one; it never chooses a network, parses or approves anything.
 */
import type { CoinId } from "./networks";

export const EVM_PICKED_WRONG =
  "This is an Ethereum-type (EVM) payment. Choose EVM in the network list above, then scan again.";
export const PSBT_PICKED_WRONG =
  "This is a TXC, ISK, BTC, LTC or DOGE payment, not an EVM one. Choose its network in the list above, then scan again.";

function looksLikeEvmRequest(t: string): boolean {
  if (!t.startsWith("{")) return false;
  try {
    const o: unknown = JSON.parse(t);
    if (!o || typeof o !== "object") return false;
    const format = (o as { format?: unknown }).format;
    return format === "hm-evm-tx" || format === "hm-thor-swap";
  } catch {
    return false;
  }
}

function looksLikePsbt(t: string): boolean {
  // PSBT magic "psbt\xff" as base64 or hex.
  return t.startsWith("cHNidP8") || /^70736274ff/i.test(t);
}

export function wrongNetworkHint(text: string, network: CoinId | "EVM"): string | null {
  const t = text.trim();
  if (network !== "EVM" && looksLikeEvmRequest(t)) return EVM_PICKED_WRONG;
  if (network === "EVM" && looksLikePsbt(t)) return PSBT_PICKED_WRONG;
  return null;
}
