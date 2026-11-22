# Roadmap — HME Seed Vault

- [x] Prepare the signed-request prerequisite for Seeds linking: 34 new verifier tests, 489/489 full-suite tests, changed-file ESLint/Prettier and actual Seeds Key f5a315cf canonical-bytes/path/signature comparison pass. Production trust stays empty; no key export/derivation, UI, dependency upgrade, APK or publication. Coordination handoff: `docs/seeds-signed-request-handoff.md`.
- [ ] Finish Seeds Key / SEEDS pocket-1106 linking: Bobby requires signed requests (2026-11-22). Seeds Key f5a315cf has signed v2 but no production trust key; SEEDS 10288a21 must issue signed requests and supply an independently verified production public key. Once supplied, pin it and build the owner-confirmed response adapter/UI with 240-character replies, hands-off refusal, passphrase-correct derivation and lock/close guards; then independent audit and phone round-trip. Blocker: upstream signing-key provisioning and signed-manifest handoff, not another owner decision.

- [x] Apply the owner-approved hands-off audit follow-up: explicit app-only limitation and lost-phone replacement warnings; shared phone-only import guard for Backup/Receive and Secrets; 455/455 tests passed, changed-file lint has no errors, preview build OK, and both browser import paths refuse mixed hands-off payloads without changing encrypted storage while normal imports read back successfully. Desktop/390px warnings checked. Auditor handoff: HME-Vault-Hands-Off-Followup-Audit-2026-11-21.md. APK build/publication remains outside this task.

- [x] Apply the 2026-11-17 batch-sweep audit follow-up at owner decision: pinned Zero Chill fee ceilings (0.02 ZCU per payment, 0.1 ZCU per batch) in the new shared `EVM_FEE_CEILINGS`, stated in the setup guide that a new seed exists only on this phone until a backup is made, and switched batch review to public-only key derivation so no private key is derived before signing. 442/442 tests, typecheck, formatting and changed-file lint pass. Auditor handoff: HME-Vault-Batch-Sweep-Followup-Audit-2026-11-17.md.

- [x] Compare EVM Wallet batch-sweep spec v2 with the build: matches except reply framing (owner kept 240-char parts); add intentHash odd-spacing test.

- [x] Batch sweep signing (`sweep-batch`, auditor-approved v1 with corrections): one approval signs up to 25 transfers to one destination; reply QR stays 240-char chunks per owner. EVM Wallet note reviewed: wallet-side items only, no Vault change.

- [x] Unpack and verify APK 0.1.202611171732: SHA256SUMS matches, full APK v2 signature verifies with the established release certificate, versionCode 26101933/minSdk 28/targetSdk 36, zero network permissions, allowBackup=false and all cloud-backup/device-transfer domains excluded, vault.local unchanged. Nectar.Pay QR and paper-copy prompts absent; full wallet pairing and Give-a-copy remain. All 410 source tests pass. APK and release audit report supplied for phone testing.
- [x] Unpack, verify and distribute APK 0.1.202611191758: SHA256SUMS matches, full APK v2 signature verifies with the established release certificate, versionCode 26101934/minSdk 28/targetSdk 36, zero network permissions, allowBackup=false with all cloud-backup/device-transfer domains excluded, vault.local unchanged, and the bundled code contains the mobile-data checklist fix (row passes when airplane mode is on or no SIM). Website download pointer and release.ts fingerprints updated; served bytes verified byte-identical. 446/446 tests pass. Owner Pixel checklist photo and file-picker/camera/fingerprint smoke tests confirmed on the prior build; an all-green checklist photo on THIS build and the gated workflow URL/source commit remain open confirmation items. Auditor record: HME-Vault-APK-Release-0.1.202611191758.md.

- [x] Remove the dedicated EVM-only "Pair with Nectar.Pay" QR and its `nectarPairingPayload` filter, tests and doc references at the owner's request; the full wallet QR is now the only pairing QR. 410/410 tests, typecheck, formatting and changed-file lint pass; desktop and phone preview checks confirm the label is gone and the full QR, TXC watch key and address dropdown remain. Nectar.Pay must be pointed at the full animated QR. Auditor handoff: HME-Vault-Nectar-Pairing-QR-Removal-Audit-2026-11-17.md.

- [x] Unpack and verify uploaded APK 0.1.202611171640 for owner phone testing: SHA256SUMS and full v2 signature verified; established certificate matches; versionCode 26101931; minSdk 28; zero network permissions; all backup/transfer domains excluded; vault.local unchanged. Shipped bulk-payment policy, per-recipient allowances, stripped-code hash, single-address dropdown and USB read-back markers confirmed. APK and auditor record supplied in Files; current website APK pointer and release fingerprints intentionally unchanged pending actual Pixel checklist and gated-workflow/source-head evidence.
- [ ] Distribute 0.1.202611171640 through the website download only after Bobby confirms the actual Pixel offline checklist and provides the successful gated workflow/source head; uploaded ZIP does not contain workflow provenance. No publication performed.
- [x] Apply the 2026-11-17 EVM bulk-payment audit: strict EIP-55 validation, hard EVM fee ceilings, dated per-chain Disperse code hashes and recipient-revert warning; owner approved all four with BNB retained. 398/398 tests, typecheck, lint and formatting pass; ten-recipient scan/review/scroll/sign flow verified with a dummy seed at desktop and phone sizes. Auditor handoff: HME-Vault-EVM-Bulk-Audit-Fixes-2026-11-17.md.
- [x] Apply the 2026-11-17 follow-up: Ethereum/Base Disperse runtime code is identical after stripping the 43-byte CBOR metadata suffix (pinned stripped hash); bulk ceilings now add 0.0005 ETH/BNB per recipient on Ethereum/BNB or 0.00005 ETH on Base, with exact N=1/N=50 accept/refuse tests on every chain; EVM Wallet pre-QR display/splitting instructions supplied. 413/413 tests, typecheck, formatting and changed-file lint pass; full-project lint stalled locally without diagnostics and remains a CI gate. Auditor handoff: HME-Vault-EVM-Bulk-Followup-Audit-2026-11-17.md.
- [ ] Build the approved EVM bulk-payment follow-up through the gated workflow, verify the APK, then run the Pixel checklist before replacing the APK or updating release fingerprints. Independent final review approved app head ceedbf9 on 2026-11-17: all 413 tests, whole-project lint, formatting, production build and exact fee-ceiling probes passed. Local rerun also passed 413/413 tests; local whole-project lint stalled again without diagnostics, while the auditor's run passed. Waiting on Bobby to start and approve the GitHub release-environment workflow because this workspace has no GitHub workflow credentials; no new APK or publication has occurred.
- [x] Add the 2026-11-02 live THORChain router evidence to the audit handoff collection (final-review housekeeping); collection now has 42 ready files.

- [x] Evaluate THORChain spec v2; owner decided /1/1 only, owner-compared deposit address, short USDC/USDT payouts allowed from UTXO, EVM fee caps 0.02 ETH / 0.002 Base / 0.02 BNB.
- [x] Build THORChain swap signing per spec v2 + owner decisions: `/1/1` only, no affiliate tags, pinned routers/tokens, rebuilt-and-compared EVM calldata, UTXO deposit-first/change-to-input-0 shape, EVM fee caps 0.02 ETH / 0.002 Base / 0.02 BNB; 307 tests pass and both swap paths were reviewed and signed through the real UI with a fake camera (dummy seeds, nothing broadcast).
- [x] Unpack and distribute uploaded APK 0.1.202611021719 to the preview download link: archive and APK checksums verified against the package's own SHA256SUMS, signing certificate matches Vault's established key (parsed from the v2 signing block; no apksigner available), permissions are camera and fingerprint only with no network permission, backups disabled with extraction rules present, and the shipped bundle confirmed to contain the file-picker lock grace plus the no-keyboard-on-open change; 324 tests pass; served file byte-identical; live site untouched. Auditor record: HME-Vault-APK-Release-0.1.202611021719.md.
- [ ] Release THORChain swap signing: independent audit of `thor.ts`/`thor-evm.ts`, HME Wallet switching its memos to `/1/1` with no affiliate tag, and three tiny funded tests (BTC→ETH, ERC-20 deposit after allowance reset, refused streaming-memo payment) before real funds. Correction 2026-11-02: APK 0.1.202611021636 (linked in the footer) already contains swap signing with all six audit fixes; treat it as the device-test build, not the release. Live routers matched on 2026-11-02 via two public THORNode providers (see HME-Vault-Live-Router-Check-2026-11-02.md); auditor has not independently re-verified. Funded tests pending. Second reading 2026-11-02 17:03 UTC (HME-Vault-Live-Router-Check-2-2026-11-02.md): routers still match; BTC/LTC/DOGE/ETH/BSC all halted with only BASE open, so each funded test needs halted=false on both legs at its moment; that reading found and fixed Vault's LTC dust floor (was 10,000, now THORChain's live 100,000 litoshis).

- [x] Consider HME Wallet's 2026-10-28 THORChain request against both source snapshots and official protocol guidance; provide a coordination/auditor response without enabling swaps. Implementation waits on owner approval and agreement on memo semantics, dynamic inbound trust, token identity, expiry and the online approval/broadcast sequence.
- [x] Cap the scanner's per-part dot grid at 120 parts and show a progress bar plus count above that (auditor performance fix); 237 tests pass, live fake-camera check of a frame declaring 1/13108 and one declaring 1/4. Independent review of this display-only change remains required before release.
- [x] Unpack and distribute uploaded APK 0.1.202611111807 to the preview download link: checksums verified against SHA256SUMS, signing certificate matches Vault's established key, permissions camera/fingerprint only with no network permission, allowBackup=false with extraction rules, shipped binary confirmed to contain single-seed sharing ("Give a copy"), USB save read-back verification and the backup-file open fix; served file byte-identical; live site untouched. Auditor record: HME-Vault-APK-Release-0.1.202611111807.md.
- [ ] Record the new APK's fingerprints and publish only after the owner's phone tests and the release gates above.
- [x] Record the owner's independent CashAddr review at head 838c6b0 (5,000 random hashes plus edge cases reported with zero mismatches); locally rerun all 233 tests successfully. No app, dependency, workflow or APK changes authorized by this review alone.
- [ ] Evaluate and apply in-range tooling security updates, a dependency-audit CI gate, explicit APK workflow permissions and a production-build step in CI after owner confirmation of the review response. Gate severity/exceptions and tag-release write permissions must be deliberate; do not perform the unnecessary Zod major upgrade.

- [x] Replace cashaddrjs with a local P2PKH-only CashAddr encoder; published reference and both original BCH addresses match, 233 tests pass, unlocked Receive checked with both dummy seeds, obsolete big-integer 1.6.36 removed. Audit handoff includes separate dependency-scan warnings; no publication or APK replacement.

- [x] Move Sign above the seed list and add offline Receive: choose seed/network, show fixed first public address QR from pairing accounts; 228 tests pass, two dummy seeds/passphrase switching and locked redirect verified, displayed BTC QR decoded, desktop/narrow screens checked. Independent review, partner path checks and gated APK/device testing remain external release gates.

- [x] Use smaller signing chunks for all outgoing signed payments; exact-byte round-trip regression added. External review and physical webcam/partner verification remain release gates.

- [x] Add the audit-approved cumulative QR collector size guard with exact-limit, duplicate and pre-completion overflow tests for HMQR2 and legacy HMQR. Independent review of this small follow-up remains required before release.

- [x] Add strictly reviewed TXC TSD Send To Many signing (1–7 recipients): published node patch checked, all seven amounts displayed, supplied QR images scanned through the UI, exact signed bytes and txid matched; 196 tests passed. Auditor handoff supplied; ISK activation, live node/regtest acceptance, independent review and gated APK/device checks remain external release requirements.

- [x] Simplify full watch-only pairing: 240-character frames, 1-second rotation, 280 px display; 10 actual QR images decoded to the unchanged 2,301-character dummy payload; 174 tests passed; auditor handoff supplied. Physical webcam/merchant-device verification and gated new APK remain external release checks.

- [x] Unpack uploaded 0.1.202610222009 APK for owner testing; archive/checksum and release signature verified, zero network permissions and backups disabled confirmed; APK and auditor brief supplied.
- [ ] Replace website APK with 0.1.202610222009 only after verified gated workflow, independent review and actual Pixel checklist result (uploaded binary alone does not verify these release gates).

- [x] Add TRON public account pairing and Solana fixed public receiving address; 170 tests passed, independent Solana fixtures verified, full QR displayed without runtime errors. Dedicated Nectar QR stays EVM-only; auditor handoff supplied. Merchant/device checks and APK rebuild remain pending below.

- [x] Add BCH/DASH public account keys to full pairing (166 tests passed; independent xpub/address vectors match; all four actual QR frames decoded; updated auditor handoff supplied; not spending support).

- [x] Expand Nectar.Pay handoff to all nine requested networks, distinguish existing exports from BCH/DASH gaps and preserve the current EVM-only QR contract.

- [x] Add a dedicated single-QR Nectar.Pay pairing filtered from the full pairing payload (162 tests passed; actual 158-character static QR decoded; desktop/narrow layout checked; audit handoff supplied).

- [x] Add Nectar.Pay EVM account public key to the existing pairing QR (159 tests passed; all four actual QR frames decoded; auditor handoff supplied).
- [ ] Verify Nectar.Pay merchant linking and old HME Wallet pairing with the new APK (requires a gated APK build, independent review and the merchant/phone apps; existing download is unchanged).

- [x] Harden checklist: API 28 SIM fallback, unknown setting sentinel, SIM/NFC-only permanent ignores, stable readiness effect and regression tests (23 focused tests; simulated unknown/ignore/override flow verified, not a phone test).
- [ ] Build checklist APK through gated workflow, record source head and test on Pixel before replacing release/footer (requires GitHub workflow access and Bobby's phone).

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
- [x] Pre-unlock offline checklist (airplane, Wi-Fi, mobile data, Bluetooth, NFC, SIM/eSIM, USB debugging, USB-to-computer; warn + override + per-row ignore; zero network permissions, never fails open)
- [ ] Build new APK and phone-test (needs Bobby / GitHub run); update `src/lib/release.ts` with the new APK SHA-256

- [ ] Pixel hide-lock checks: file picker (open/save backup) keeps Vault unlocked under 2 min; camera permission prompt and fingerprint prompt — note whether they lock Vault (not covered by the picker grace). The picker fix is now in APK 0.1.202611021719 (preview download); it was not in 0.1.202611021636.

## Auditor housekeeping (2026-11-19) — done
- [x] APK workflow: top-level read-only token; GitHub Release moved to its own write-scoped job (tags only)
- [x] APK workflow: fails if merged manifest requests INTERNET/ACCESS_NETWORK_STATE/ACCESS_WIFI_STATE without removal, or if HME_REMOTE_URL is set
- [x] CI: production build + `bun audit --audit-level=critical` (tar 6.x via Capacitor CLI ignored, build-tool only)
- [x] `bun audit fix` in-range bumps
- [x] Zero Chill named in single-transfer review
- [ ] Release 0.1.202611171732 to site — blocked on Pixel checklist + gated workflow run URL/source commit

- [x] Phone checks (2026-11-19, Bobby): Vault stays unlocked after saving a backup file; no self-lock during camera or fingerprint prompts.
