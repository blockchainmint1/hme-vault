# Roadmap — HME Seed Vault

- [x] Harden Vault signing: unreadable swap data blocked, explicit fee cap checked before approval and after signing, reviewed bytes/keys bound to approval, failed attempts leave unsigned requests unchanged (80 tests passed; actual dummy QR rejection and normal DOGE approval/signed QR verified; new APK required).
- [ ] Enable safe THORChain swaps only after readable offline intent validation and HME Wallet output/refund/expiry fixes (requires coordinated work in HME Wallet; current swaps remain blocked).

- [x] Prompt for a new backup after successfully adding seeds, secrets or authenticator accounts (23 tests passed; dummy seed/note/2FA saves, Later, backup navigation and encrypted file download verified; new APK needed for phone use).

- [x] Resume selected encrypted backups directly in Receive after file-picker/background locking (dummy coin-plus-word unlock, second lock, successful import and Secrets readback verified; 26 tests passed; new APK needed for Android picker check).

- [x] Apply coin-plus-secret-word confirmations to erase, reveal/delete, signing, relinking and backup recovery (dummy unlock, secret/code reveal, erase and standalone recovery verified; 51 tests passed; new APK needed for phone checks)

- [x] Add seven-step setup, backup, pairing and signing tutorial linked from the homepage (official GrapheneOS guidance checked; desktop/mobile navigation verified; online-wallet steps explicitly conditional on wallet support)

- [x] Same-key encrypted backups, offline QR device copying and simple USB file saving (dummy two-device import, actual QR decoding, duplicate skipping and receiver-key retention verified; Android USB/fingerprint checks remain part of the phone test below)

- [x] Hidden coin seed QR setup/unlock, existing Vault relinking and scan-based sensitive confirmations (dummy camera flow verified; standard HMVAULT1 recovery retained)
- [x] Allow coin scanning for existing optional fingerprint enrollment and disclose its app-only protection limitation
- [x] Enforce fingerprint secret release in Android security hardware (Keystore/StrongBox, invalidated on new fingerprint)
- [ ] Verify hardware fingerprint unlock on Bobby's GrapheneOS Pixel (needs APK build + phone test)

- [x] Store passwords, notes and small files in the encrypted vault
- [x] Offline TOTP authenticator (scan 2FA QR or paste setup code, live 6/8-digit codes with countdown; RFC 6238 vectors tested, dummy browser flow verified)
- [x] Standalone encrypted QR transfer page and multi-part scanning (dummy cycling QR camera feed verified)
- [x] Full-vault cycling QR backups, USB picker and offline recovery for files (Android picker needs the phone test below)
- [x] Remove signing secrets from future GitHub logs; test complete secret backup/restore

- [x] Turn this copy into the offline seed vault (wallet features removed)
- [x] Vault password, fingerprint unlock, auto-lock, wrong-password waits
- [x] Add / make seeds, view words + QR, watch-only TXC/EVM QR, rename, delete, erase
- [x] Encrypted backup (QR + file), restore with merge, offline unlocker page
- [x] Android build: no internet permission, no screenshots, no cloud backup, new app name
- [ ] Build the APK on GitHub and test camera transfers, USB save/open, background locking and dummy seed/keystore restore on the offline phone (needs Bobby's phone and GitHub run)
- [x] Phase 2: offline signing for TXC / ISK (scan unsigned payment, review, sign, show signed QR)
- [ ] Online HME Wallet: add 'make unsigned payment' + scan signed QR (handoff in docs/offline-signing-handoff.md — needs the wallet project)
- [x] Pairing QR (TXC + ISK, all address types)
- [x] Show TSD token amounts on the signing review

- [x] Add BTC, LTC and DOGE PSBT signing with explicit network selection and legacy TXC path protection
- [x] Add offline EVM native and ERC-20 transfer signing with readable review and no blind calls
- [x] Expand pairing codes and online-wallet handoff; test all new signing flows (62 tests; dummy vault browser approval/signing/QR verified for BTC, LTC, DOGE and EVM)

- [ ] Verify new coin signing on the APK and complete small real-chain payments plus independent security review (needs Bobby’s device, online-wallet changes and external review)

## Security review 2026-10-18 (owner/outside-app items)
- [ ] GitHub: protect `main` (reviewed PRs, no force-push), protect `android-v*` tags, create `release` environment with owner as required reviewer and move the 4 ANDROID_* secrets into it — needs Bobby in GitHub settings
- [ ] Confirm every phone is on 0.1.202610181456+ (reinstall older ones after backing up) — needs Bobby
- [ ] Wrap stored vault with Android Keystore key (N10/N14) — larger native change, next round
- [ ] Remove 'unsafe-inline' from CSP and platform scripts on web vault (M1/O1) — needs hosting changes
- [ ] Native tamper-proof lockout clock (optional)

## Follow-up audit 2026-10-22 (Fable)
- [x] Per-coin fee caps (DOGE 1,000,000 koinu/vB), near-cap warning, Omni recipient = last output
- [x] Native deletion of the old secure-storage password copy; fixed comment
- [x] Locking wins over a slow unlock (app + recovery page)
- [x] Typed-password strength enforced at the format layer
- [x] 1,000,000 encryption rounds (older files still open)
- [x] Change password in Settings (turns fingerprint off)
- [x] CI gate + formatting pass; APK fingerprints in footer
- [x] Docs now describe Vault; unused libraries removed
- [x] Web "Demo only" banner (H2)
- [x] M1 declined by owner design; documented
- [ ] Build new APK and phone-test (needs Bobby / GitHub run); update `src/lib/release.ts` with the new APK SHA-256
