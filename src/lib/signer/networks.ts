import { networks, type Network } from "bitcoinjs-lib";

export type CoinId = "TXC" | "ISK" | "BTC" | "LTC" | "DOGE";
export const COIN_IDS: CoinId[] = ["TXC", "ISK", "BTC", "LTC", "DOGE"];
export const NETWORKS: Record<CoinId, Network> = {
  TXC: { messagePrefix: "\x18Bitcoin Signed Message:\n", bech32: "txc", bip32: { public: 0x0488b21e, private: 0x0488ade4 }, pubKeyHash: 0x42, scriptHash: 0x41, wif: 0xc1 },
  ISK: { messagePrefix: "\x18Bitcoin Signed Message:\n", bech32: "isk", bip32: { public: 0x0488b21e, private: 0x0488ade4 }, pubKeyHash: 0x2d, scriptHash: 0x2c, wif: 0xad },
  BTC: networks.bitcoin,
  LTC: { messagePrefix: "\x19Litecoin Signed Message:\n", bech32: "ltc", bip32: { public: 0x019da462, private: 0x019d9cfe }, pubKeyHash: 0x30, scriptHash: 0x32, wif: 0xb0 },
  DOGE: { messagePrefix: "\x19Dogecoin Signed Message:\n", bech32: "", bip32: { public: 0x02facafd, private: 0x02fac398 }, pubKeyHash: 0x1e, scriptHash: 0x16, wif: 0x9e },
};

/** An explicit TXC selection preserves old BlueWallet coin-0 paths; never infer BTC vs TXC. */
export function coinFromCoinType(ct: number, selected?: CoinId): CoinId | null {
  if (ct === 0) return selected === "TXC" ? "TXC" : "BTC";
  if (ct === 696969) return "TXC";
  if (ct === 969696) return "ISK";
  if (ct === 2) return "LTC";
  if (ct === 3) return "DOGE";
  return null;
}
