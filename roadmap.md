# Roadmap — HME Seed Vault

- [x] Store passwords, notes and small files in the encrypted vault
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

- [ ] Add BTC, LTC and DOGE PSBT signing with explicit network selection and legacy TXC path protection
- [ ] Add offline EVM native and ERC-20 transfer signing with readable review and no blind calls
- [ ] Expand pairing codes and online-wallet handoff; test all new signing flows
