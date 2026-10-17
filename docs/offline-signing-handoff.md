# Offline signing — online-wallet integration

Vault signs offline and returns signed raw transactions by QR; the online wallet builds and broadcasts. It never sends seeds or private keys.

## Bitcoin-family PSBT (BIP-174)

The user selects TXC, ISK, BTC, LTC or DOGE before scanning. PSBT does **not** contain a chain ID: never infer a network from the fingerprint or coin-0 path. A valid Bitcoin transaction may also be valid on a fork; the offline device cannot prove network origin.

| Network | Coin type | P2PKH | P2SH | Bech32 | Address purposes |
| --- | --- | --- | --- | --- | --- |
| TXC | 696969 | 0x42 | 0x41 | txc | 44, 49, 84 |
| ISK | 969696 | 0x2d | 0x2c | isk | 44, 49, 84 |
| BTC | 0 | 0x00 | 0x05 | bc | 44, 49, 84 |
| LTC | 2 | 0x30 | 0x32 | ltc | 44, 49, 84 |
| DOGE | 3 | 0x1e | 0x16 | none | 44 only |

- Paths must be `m/<purpose>'/<coin>'/<account>'/<0 or 1>/<index>`. Account/index up to 1,000,000. Coin-0 paths remain accepted as legacy TXC **only when TXC is explicitly selected**; BTC selection treats coin 0 as BTC. Other coin/path mismatches are rejected.
- Each input requires `bip32Derivation` (real master fingerprint, path, matching pubkey), and the previous output. Legacy requires the **full nonWitnessUtxo** with matching previous transaction hash. Segwit permits witnessUtxo; wrapped segwit needs redeemScript. If both previous-output forms are present they must agree.
- Only unsigned inputs and SIGHASH_ALL are accepted. No multisig, Taproot, MWEB, Dogecoin segwit or partially signed PSBTs in this release.
- Change should carry matching output bip32Derivation; otherwise it is shown as a payment, never silently hidden.
- All outputs, change and known input values determine the displayed fee. Input values for segwit are supplied by the online wallet; this phone cannot query the chain.
- TXC/ISK Omni Simple Send property 39 displays TSD amounts. Unknown data produces a warning.
- Mainnet networks only. BTC/LTC/DOGE tests cover a signed raw transaction for every supported address purpose; real chain broadcast/payment tests still require the online wallet.

## EVM transfers

QR is a strict JSON intent (`format: "hm-evm-tx"`, `v: 1`). No RPC, gas estimation, message signing, approvals, arbitrary calldata, contract deployment, access lists, blobs or EIP-7702 authorizations. Vault builds ERC-20 `transfer(address,uint256)` calldata locally. This cannot prove a token contract actually behaves like an ERC-20.

Example native transfer (test addresses; never use these as live payment details):

```json
{
  "format": "hm-evm-tx", "v": 1, "kind": "native-transfer",
  "fp": "73c5da0a", "path": "m/44'/60'/0'/0/0",
  "chainId": 1,
  "from": "0x9858effd232b4033e47d90003d41ec34ecaeda94",
  "to": "0x1111111111111111111111111111111111111111",
  "value": "1000000000000000000", "nonce": 7, "gas": "21000",
  "type": "eip1559", "maxFeePerGas": "30000000000", "maxPriorityFeePerGas": "1000000000"
}
```

- ERC-20: replace `kind` with `erc20-transfer`, omit `value`, add `token` (contract address) and `amount` (integer raw token units). `to` is the recipient, not the contract. No token decimals/symbol are accepted from the online wallet; review shows contract and raw units.
- Legacy type uses `type: "legacy"` plus `gasPrice`, and omits the EIP-1559 fee fields. All fees, gas, amounts are canonical unsigned decimal strings; sender must match the fingerprint and full EVM path. Supported EVM path: `m/44'/60'/<account>'/0/<index>`, each account/index up to 999999.
- Native transfer value and ERC-20 amount must be positive. Zero recipient/sender/contract addresses are rejected. Nonce up to 2^32-1; gas 21,000 to 100,000,000; chain ID positive safe integer. JSON max 8192 characters; unknown fields rejected.
- Chain ID is signed, including custom EVM IDs (so ZCU can use its actual ID without an online lookup). Known Ethereum, Optimism, BNB, Polygon, Base, Arbitrum, Avalanche and Sepolia show their local names/18-decimal native currency. Unlisted chains show the ID plus **raw native base units**, not guessed decimals or symbols.
- Gas fee shown is `gas * gasPrice` or `gas * maxFeePerGas`; it is a gas ceiling, not a guarantee of total fees. L2 data fees and other chain-specific charges may apply. Vault cannot check balance, nonce, gas sufficiency or contract behavior offline.
- Returned EVM signed hex includes `0x`; Bitcoin-family signed hex does not. The online wallet knows the selected network and broadcasts there. Displayed EVM transaction ID is Keccak-256 of the signed bytes.

## QR transport

Raw base64/hex PSBT or EVM JSON. Long values use content-labelled `HMQR2:<8-hex label>:<n>/<total>:<chunk>` (600 characters per frame, ~700 ms cycling). Read both HMQR2 and legacy HMQR; reject conflicting parts. See `src/lib/signer/qr-parts.ts` for bounds. Vault returns signed raw transaction bytes, not a JSON response wrapper.

## Watch-only pairing

`hmvault: 1` remains backward-compatible; additional keys are optional to old readers:

```json
{
  "hmvault": 1, "fp": "73c5da0a",
  "txc": { "84": "xpub…", "49": "xpub…", "44": "xpub…" },
  "isk": { "84": "xpub…", "49": "xpub…", "44": "xpub…" },
  "btc": { "84": "xpub…", "49": "xpub…", "44": "xpub…" },
  "ltc": { "84": "xpub…", "49": "xpub…", "44": "xpub…" },
  "doge": { "44": "xpub…" },
  "evm": { "address": "0x…", "path": "m/44'/60'/0'/0/0" }
}
```

Account keys use standard **xpub version bytes on all coins** at `m/<purpose>'/<coin>'/0'`; apply the selected chain's address encoding when deriving `/0/i` and `/1/i`. No xprv is exported. These watch-only keys cannot spend, but reveal wallet history and should be shared privately.

## Before real funds

Online-wallet implementation, device QR signing/return tests, actual small payment broadcasts on each chain, and independent security review remain required. Unit/browser tests use dummy seeds and do not establish production safety.
