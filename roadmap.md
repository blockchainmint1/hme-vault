# Roadmap — HME Seed Vault

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
