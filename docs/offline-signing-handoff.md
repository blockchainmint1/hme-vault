# Offline signing — what the online HME Wallet must do

The Seed Vault phone signs TXC / ISK payments by QR. It never goes online. The online wallet builds and broadcasts.

## 1. Build an unsigned PSBT (BIP-174)
- Network: TXC (`bech32 txc`, P2PKH 0x42, P2SH 0x41) or ISK (`isk`, 0x2d, 0x2c). One coin per PSBT.
- Every input MUST carry:
  - `witnessUtxo` (segwit / wrapped segwit) or `nonWitnessUtxo` (legacy), and `redeemScript` for wrapped segwit;
  - `bip32Derivation` with the seed's **master fingerprint** (8 hex chars, shown in the vault) and full path, e.g. `m/84'/696969'/0'/0/3`. Coin type 0' paths are treated as TXC legacy.
- Change outputs SHOULD carry `bip32Derivation` too, so the vault shows them as "Back to you". Change without it is displayed as a payment.
- OP_RETURN (Omni / TSD) outputs are allowed. The vault shows a warning that the token amount can't be decoded yet.

## 2. Show it as QR
- Base64 (or hex) PSBT. If longer than 600 characters, split into frames `HMQR:<n>/<total>:<chunk>` and cycle them (~700 ms per frame).

## 3. Scan the signed result
- The vault shows the **fully signed raw transaction hex**, using content-labelled `HMQR2:<8-hex label>:<n>/<total>:<chunk>` framing when it's long. Reassemble it and broadcast as-is. Support both `HMQR2` and legacy `HMQR` on the online side; see `src/lib/signer/qr-parts.ts` for bounds and mixed-transfer rejection. The vault still accepts legacy `HMQR` input.

## Watch-only pairing
Each seed page shows a "Pair with online wallet" QR (HMQR2-framed if long) containing:
```json
{ "hmvault": 1, "fp": "73c5da0a",
  "txc": { "84": "xpub…", "49": "xpub…", "44": "xpub…" },
  "isk": { "84": "xpub…", "49": "xpub…", "44": "xpub…" } }
```
Keys are account-level (`m/<purpose>'/<coin>'/0'`), standard xpub version bytes. The online wallet derives `/0/i` and `/1/i` from them and uses `fp` + full path in every PSBT `bip32Derivation`.
