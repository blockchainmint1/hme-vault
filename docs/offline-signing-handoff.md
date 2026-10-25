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
- TXC/ISK Omni Simple Send property 39 displays TSD amounts. Only one zero-value, exactly decoded Omni Simple Send data output is accepted on TXC/ISK; unknown properties display raw units. All other data outputs, including THORChain swap memos, are blocked, not merely warned about.
- The existing conservative fee cap is explicitly 5,000 base units/vB on all Bitcoin-family networks (not 5,000 coins). Review checks a lower bound on fee rate using the maximum supported signed size; finalization checks the exact rate. No QR field or online quote can raise this cap. This is a safety ceiling, not a recommended network fee, and can reject legitimate DOGE fees.
- Signing requires the same PSBT bytes and keys that passed review and signs a private clone. Failed signing never leaves the reviewed PSBT partially signed. No signed QR is returned on rejection.
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

### Webcam-friendly full pairing — October 25, 2026

The full watch-only pairing QR now uses **240-character chunks**, **1,000 ms per frame**, and a **280 px** display instead of 600-character chunks at 700 ms and 240 px. Every displayed QR has a four-module quiet zone. The complete JSON and all public receiving data remain identical; only transport density and timing change. Pause/previous/next controls remain available. Individual addresses and the compact EVM-only Nectar.Pay QR remain static.

Readers must collect numbered HMQR2 chunks in any order with repeats and concatenate exactly before parsing JSON; do not assume 600 characters per chunk. Verify the content label over the assembled text independent of chunk size. Vault's collector now handles 240–2,000-character chunk sizes (default writer 600), including transfers whose combined text is shorter than 600. The 3 MiB assembled-text bound, conflicting-part rejection and legacy HMQR reading remain. The bounded part-count ceiling becomes 13,108 to accommodate the existing maximum at 240 characters. FNV-1a labels detect accidental mixing/damage, not malicious authentication.

Backup and payment transfers retain their 600-character/700 ms defaults. Real webcam focus, Nectar.Pay and existing HME Wallet scanning still need partner/device checks; software decoding alone does not establish physical webcam performance. A gated APK rebuild and independent audit remain necessary before phone release.

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
  "bch": { "44": "xpub…" },
  "dash": { "44": "xpub…" },
  "tron": { "44": "xpub…" },
  "sol": { "address": "<base58 raw ed25519 public key>", "path": "m/44'/501'/0'/0'" },
  "evm": { "address": "0x…", "path": "m/44'/60'/0'/0/0", "xpub": "xpub…" }
}
```

BIP-32 account keys use standard **xpub version bytes on all coins** at `m/<purpose>'/<coin>'/0'`; apply the selected chain's address encoding when deriving `/0/i` and `/1/i`. Solana instead exports a fixed public address/path, not an xpub. No xprv is exported. These watch-only keys cannot spend, but reveal wallet history and should be shared privately.

`evm.xpub` is the public account key at **`m/44'/60'/0'`**, with standard BIP-32 public version `0x0488b21e`. It is an additive field: the existing `evm.address` and `evm.path` still describe address #0. Old readers may ignore `xpub`; no pairing version or QR framing change is required. The seed's optional passphrase applies to this key just as it does to every other pairing key.

Nectar.Pay derives relative `m/0/n` from this EVM account xpub, starting at **n = 1** (never sale address #0). Convert each compressed child public key to uncompressed form, take Keccak-256 of the 64-byte X/Y coordinates (without the `0x04` prefix), and use the last 20 bytes as the EVM address. This supplies fresh receiving addresses for ETH and EVM networks such as Base, BSC and ZCU without network access or spending keys in Vault. Nectar.Pay reports that presence of this field enables ETH linking automatically; merchant-side linking still needs an integration test.

Privacy warning: an account xpub reveals all non-hardened receiving addresses. Never share a child private key with an xpub recipient: BIP-32 non-hardened derivation can expose the account private key when both are known. Vault's pairing QR contains public keys only; seed words, passphrases and private keys are not included.

### Dedicated Nectar.Pay pairing QR

The seed screen also shows **Pair with Nectar.Pay** beside the full wallet pairing QR (stacked on narrow screens). Its payload contains exactly:

```json
{"hmvault":1,"fp":"73c5da0a","evm":{"xpub":"xpub…"}}
```

`nectarPairingPayload` filters the already-generated `pairingPayload` JSON; it performs no separate key derivation. The fingerprint and EVM account xpub therefore match the full QR, including any seed passphrase. No other coin keys, address or path are included. The full HME Wallet QR is unchanged.

The compact payload fits within the HMQR2 transport's 600-character single-frame limit. As with all short payloads in Vault, it is displayed as **plain JSON in one static QR**, without an HMQR2 multipart envelope. Nectar.Pay must read this as EVM-only pairing; use the full wallet QR when linking the other coins. The same account-xpub privacy and child-private-key precautions apply. Actual Nectar.Pay merchant scanning remains a release integration check.

## Before real funds

### Nectar.Pay requested network coverage — October 22, 2026

The owner requires the Nectar.Pay integration handoff to cover **EVM, BTC, LTC, DOGE, BCH, TXC, ISK, ZCU, DASH, TRON and Solana**. All eleven categories now have receiving data; merchant integration, phone verification and spending support are not implied.

| Requested network | Current full pairing field | Public account path | Nectar.Pay receiving convention / status |
| --- | --- | --- | --- |
| EVM (ETH, Base, BSC and other EVM networks) | `evm.xpub` | `m/44'/60'/0'` | Derive `/0/n`, n starts at 1; EVM address encoding. Export implemented; partner scan/link check pending. |
| BTC | `btc["84"]` | `m/84'/0'/0'` | Native SegWit P2WPKH. Export implemented; Nectar.Pay reports using this field. |
| LTC | `ltc["84"]` | `m/84'/2'/0'` | Native SegWit P2WPKH with Litecoin encoding. Export implemented; Nectar.Pay reports using this field. |
| DOGE | `doge["44"]` | `m/44'/3'/0'` | Legacy P2PKH with Dogecoin encoding. Export implemented; Nectar.Pay reports using this field. |
| BCH | `bch["44"]` | `m/44'/145'/0'` | Public account export implemented. Derive P2PKH hash160 and encode as mainnet CashAddr (`bitcoincash:`) in Nectar.Pay. Merchant address verification pending; BCH signing is not supported by Vault. |
| TXC | `txc["44"]` | `m/44'/696969'/0'` | Legacy P2PKH using TXC network bytes, also used for TSD. Export implemented; Nectar.Pay reports using this field. |
| ISK | `isk["44"]` | `m/44'/969696'/0'` | Legacy P2PKH using ISK network bytes. Export implemented; Nectar.Pay's ISK field/address convention still needs confirmation. |
| ZCU | `evm.xpub` (no separate `zcu` field) | `m/44'/60'/0'` | Same EVM account derivation; Nectar.Pay must identify ZCU's actual network/chain configuration independently. No chain ID is supplied by pairing. |
| DASH | `dash["44"]` | `m/44'/5'/0'` | Public account export implemented. Mainnet P2PKH Base58Check version `0x4c` (76). Merchant address verification pending; DASH signing is not supported by Vault. |
| TRON | `tron["44"]` | `m/44'/195'/0'` | Standard public xpub; derive `/0/n`, apply TRON Base58Check encoding. Merchant recognition/index policy pending; no TRON signing. |
| Solana | `sol.address`, `sol.path` | `m/44'/501'/0'/0'` | One fixed receiving address: Base58 of raw 32-byte SLIP-0010 ed25519 public key. No public derivation of further accounts; no Solana signing. |

For implemented Bitcoin-family account keys, derive relative `/0/n` receiving children and apply the chosen chain's address encoding. The original Nectar.Pay request explicitly confirms n starts at 1 for EVM; confirm the starting index and reserved address #0 policy on each other chain rather than assuming it. All exported account keys use standard `xpub` public version bytes `0x0488b21e`, not network-specific extended-key prefixes. The master fingerprint and optional seed passphrase must remain consistent across all keys.

**Which QR to scan today:** the dedicated **Pair with Nectar.Pay** QR is still EVM-only, exactly as documented above. For all eleven requested network categories, scan the existing **full wallet QR**, which now includes additive BCH, DASH, TRON public account fields and a Solana public address/path. ZCU uses `evm.xpub`, not a duplicate ZCU key. Nectar.Pay must accept plain JSON and multi-part HMQR2. APK rebuilding, independent review and merchant-device testing remain pending.

**Partner integration contract:** Nectar.Pay should read additive `bch["44"]` and `dash["44"]` account fields at the exact paths above, with standard xpub public versions. Existing full-pairing fields and version remain unchanged. Confirm receiving address encodings and sale indexes against independent references before use. If the dedicated Nectar.Pay QR is later expanded to carry all coin keys, filter them from the full payload rather than deriving separately and replace the one-static-frame requirement with animated transport; that dedicated-QR expansion is not part of this change.

### TRON and Solana receiving contract

Nectar.Pay must read `tron["44"]` and `sol` from the full QR; the dedicated Nectar.Pay QR remains EVM-only. TRON uses standard xpub version `0x0488b21e` and public children `/0/n`. Convert compressed secp256k1 children to uncompressed X/Y, Keccak-256 the 64 bytes without the `0x04` prefix, take the last 20 bytes, prefix `0x41`, and Base58Check encode with the double-SHA-256 checksum. Confirm sale starting indexes independently; EVM's n=1 policy does not automatically apply to TRON.

Solana uses `m/44'/501'/0'/0'`, a common Phantom recovery-phrase path; other wallet paths differ. The seed passphrase applies to both curves. `fp` remains the existing secp256k1 master fingerprint and is a pairing identifier, not a Solana master fingerprint. Solana SLIP-0010 is hardened-only and cannot derive children from public keys. Nectar.Pay must accept one fixed receiving address, or agree a future finite address-list export; never request private keys, derive `/0/n` from this address, or pretend an ed25519 xpub exists. Only raw 32-byte public address and path are exported, no chain code or private material. Token-account discovery/creation (SPL, TRC-20) and merchant tracking belong to Nectar.Pay; token integration is not established by this export.

Public dummy vectors (`abandon` × 11 + `about`; never receive real funds): TRON `/0/0` = `TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH`, `/0/1` = `TSeJkUh4Qv67VNFwY8LaAxERygNdy6NQZK`. Solana at the path above = `HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk` (empty passphrase), or `nfPtm3Bu5wtxSWRN4wxP9C6knv8UR3dUQ8uy3ykUMfi` (literal dummy passphrase `Nectar dummy passphrase`). Independent Python HMAC/ed25519 derivation agrees with both Solana fixtures.

References: [TRON wallet guide](https://developers.tron.network/docs/wallet-developer-guide), [TRON encoding](https://developers.tron.network/docs/account), [SLIP-0010](https://github.com/satoshilabs/slips/blob/master/slip-0010.md), [Phantom paths](https://help.phantom.com/hc/en-us/articles/12988493966227-Which-derivation-paths-does-Phantom-use).

Dummy reference addresses (mnemonic `abandon` × 11 + `about`, empty passphrase; never receive real funds here):

| Network | Relative child | Reference P2PKH address |
| --- | --- | --- |
| BCH | `/0/1` | `18Cp2ivkLHyJwHMm9NzDRBh6Gi7m4MC2we` |
| BCH | `/0/2` | `15Ax9BJRJ4TABF85UsPpz9QvuBpiJhCfsw` |
| DASH | `/0/1` | `XbctnEsgWTn5j1co3emZynemxSFPqkLRKZ` |
| DASH | `/0/2` | `XdD2biTJ3saZtcR6ravwJ9bvmkvmDq49Xg` |

BCH reference addresses above use legacy Base58Check version 0 solely for hash160 comparison. Nectar.Pay should display the equivalent mainnet CashAddr and verify it maps to the same P2PKH hash; Vault exports an account xpub, not a BCH address encoder. DASH references use mainnet version 76. Tests pin both account xpubs and these addresses and check passphrase-dependent public child derivation.

**Acceptance before release:** verify each of the eleven requested network entries with Nectar.Pay, including first/next sale addresses (Solana is fixed), passphrase handling, real-phone QR collection and existing HME Wallet compatibility. Receiving-key export alone does not mean Vault can sign BCH, DASH, TRON or Solana transactions; none is currently supported. ZCU spending uses the existing chain-bound EVM intent, with the actual chain ID and readable offline review. No internet, balances, broadcasting or online merchant features are added to Vault. Independent audit and the gated APK workflow remain required.

THORChain swaps remain unsupported in Vault until a strict, readable swap-intent review can validate the memo, exact destination asset/network, recipient, minimum output and refund ownership against the transaction. HME Wallet also needs a dedicated THORChain builder (deposit output first, documented VIN0 change/refund handling), required expiry/fresh inbound checks before broadcast, and end-to-end small-payment/refund testing. An offline phone cannot independently verify a live quote, vault address, halted chain or eventual delivery. Do not fix the current failure by bypassing fee checks or treating the memo as an ordinary transfer.

Online-wallet implementation, device QR signing/return tests, actual small payment broadcasts on each chain, and independent security review remain required. Unit/browser tests use dummy seeds and do not establish production safety.
