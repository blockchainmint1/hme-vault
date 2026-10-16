import type { Network } from "bitcoinjs-lib";

export type CoinId = "TXC" | "ISK";

export const NETWORKS: Record<CoinId, Network> = {
  TXC: {
    messagePrefix: "\x18Bitcoin Signed Message:\n",
    bech32: "txc",
    bip32: { public: 0x0488b21e, private: 0x0488ade4 },
    pubKeyHash: 0x42,
    scriptHash: 0x41,
    wif: 0xc1,
  },
  ISK: {
    messagePrefix: "\x18Bitcoin Signed Message:\n",
    bech32: "isk",
    bip32: { public: 0x0488b21e, private: 0x0488ade4 },
    pubKeyHash: 0x2d,
    scriptHash: 0x2c,
    wif: 0xad,
  },
};

/**
 * SLIP-44 coin type -> coin. Coin type 0 is TXC's legacy path from the old
 * BlueWallet-fork app (real funds live there), never Bitcoin in this signer.
 */
export function coinFromCoinType(ct: number): CoinId | null {
  if (ct === 696969 || ct === 0) return "TXC";
  if (ct === 969696) return "ISK";
  return null;
}
