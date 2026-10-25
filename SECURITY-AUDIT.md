# HME Vault — security status

This file describes **HME Vault**, the offline seed and secret vault (Android APK, plus a web demo at vault.honest.money). It replaces the old HME Wallet audit that used to live here.

## Design summary

- One encrypted HMVAULT1 blob on disk: PBKDF2-HMAC-SHA512 (1,000,000 iterations for new files; the stored count is honoured, so 600,000-iteration files still open), AES-256-GCM, AAD `HMVAULT1`. Format: `docs/seed-vault-format.md`.
- Decrypted seeds, secrets and the credential live in memory only and are dropped on lock (2 min idle, app hidden, page hide). Unlocks that finish after a lock are discarded.
- Android APK: zero network permissions — INTERNET, CHANGE_* and ACCESS_NETWORK_STATE/ACCESS_WIFI_STATE are all removed with `tools:node="remove"`, so the manifest itself proves the app cannot open a socket. The pre-unlock offline checklist reads only permission-free Settings.Global values and the battery plug state (warns, owner may override or permanently ignore a single row); on any native read error every row reports "couldn't check" and the override is required (never fails open). `allowBackup="false"`, data extraction excluded, minSdk 28, screenshots blocked.
- Fingerprint: the credential is sealed by an AES key in Android Keystore (StrongBox when present), usable only after a strong biometric match and invalidated on enrolment change. Changing the credential disables it. Old secure-storage copies from builds before 0.1.202610181456 are deleted natively on every start.
- Offline signing (`src/lib/signer`): explicit network selection; every input verified against vault seeds; SIGHASH_ALL only; unknown data outputs (including THORChain memos) blocked; frozen per-coin fee caps checked at review and after finalization; signing bound to reviewed bytes and keys.
- TXC TSD Send To Many (2026-10-25): only version 0/type 7/property 39, 1–7 positive amounts with unique explicit output indices and signed-64-bit-bounded total; one canonical zero-value OP_RETURN, no missing/data/verified-change/zero-value recipient targets. Review displays every actual output address and token amount; existing fee and approval safeguards remain. ISK type 7 and broader Omni instructions remain blocked. Published node patch and exact dummy signing vectors verified; independent review, live-node/regtest acceptance and APK/device checks remain required.
- CI gate: formatting, lint, typecheck and unit tests run on every push and before every APK build.

## Status of the 2026-10-21/22 review (Fable)

| ID | Status |
| --- | --- |
| H1 signing key in Actions log | Closed by owner 2026-10-22 (no such run exists) |
| H2 web build is a real vault | Mitigated: permanent "Demo only" banner on every web screen. Creation stays available on the web by owner choice (demo and recovery use) |
| M1 coin QR accepts any text | **Declined — by design.** The owner requires that any scanned QR works as the credential. Seeds and private keys are normalized; other content is used verbatim. Owners are told to use the hidden/secret QR. Not a defect to be fixed |
| M2 KDF cost | Fixed: 1,000,000 iterations. Argon2id (HMVAULT2) not planned yet |
| M3 no password change | Fixed: Settings → Change Vault password; `changePassword` disables fingerprint itself |
| M4 Omni recipient label | Simple Send: last non-change output, with a warning when there are several. TXC Send To Many: explicit vout-to-address/amount mapping for every recipient |
| M5 no CI gate | Fixed: `ci.yml` and APK workflow gates; repo formatted |
| M6 APK fingerprints | Fixed: footer publishes file SHA-256 and signing-certificate SHA-256 (`src/lib/release.ts`) |
| M7 stale docs | Fixed: this file, `CAPACITOR.md`, `ANDROID.md`, privacy page, CSP comment |
| L1 dead code | Partly fixed: 11 unused libraries removed. Generated backend client files remain (platform-managed) but are never imported |
| L2–L4 | Accepted for now (instant lock on hide is intentional; lockout/JS-string limits documented) |
| L5 8 vs 10 characters | Fixed for typed passwords via `lockTypedText`; `lockText` keeps an 8-character floor for scanned coin credentials |
| Patch item: per-coin fee cap | Fixed: `MAX_FEE_RATES` BTC/LTC/TXC/ISK 5,000, DOGE 1,000,000 base units/vB, frozen |
| Patch item: near-cap surprise | Fixed: warning at 80% of the cap |
| Patch item: legacy biometric | Fixed natively; comment corrected |
| Patch item: unlock race | Fixed in the app and in the standalone recovery page |

## Follow-up on the offline checklist (2026-10-22)

The auditor approved the checklist idea but rejected the permission trade and found a fail-open bug. All points fixed:

- ACCESS_NETWORK_STATE/ACCESS_WIFI_STATE removed again — the APK is back to provably zero network permissions; the checklist reads permission-free Settings.Global values and the battery plug state instead of WifiManager/ConnectivityManager/UsbManager.
- Fail-open fixed: a native plugin error now yields an all-unknown status, so every row says "couldn't check" and the owner override is required.
- New checks that matter more than the old ones: USB debugging (ADB) and "connected to a computer over USB" (the real exfil path), plus every SIM slot including eSIM.
- Airplane mode is now shown; the unlock form passes a stable callback so the checklist effect doesn't re-fire every render.
- eSIM handling: only SIM and NFC may be permanently ignored ("Always ignore"), including unknown states, stored in localStorage (non-secret). Wi-Fi, mobile data, Bluetooth, ADB, USB-to-computer and airplane mode cannot be permanently ignored, even if unreadable. Shared logic rejects old protected ignore preferences; temporary explicit owner override remains available.
- Compatibility hardening: SIM slot enumeration uses getPhoneCount on API 28/29 and getActiveModemCount on API 30+, catching Throwable only for the SIM block. Settings.Global reads use -1 as the missing sentinel and return unknown, never off, when missing. The displayed checklist is memoized to stabilize readiness updates. Native readings still require a Pixel test.

## Still open

- Device testing of the new APK (fingerprint, USB, blocked network, legacy cleanup on an old phone, checklist rows on the Pixel).
- Wrapping the stored blob with an Android Keystore key; tamper-proof native lockout clock.
- Removing `'unsafe-inline'` from the web demo's CSP.
- THORChain swaps remain blocked until a readable swap-intent review exists.
