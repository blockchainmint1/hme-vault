# HME Seed Vault — offline Android seed storage (phase 1)

This project stops being a wallet and becomes a seed-storage app for an offline phone. Phase 2 (air-gapped signing, as planned in Seed Builder) is built on the same base later.

## What you'll get (phase 1)

- **Set up:** first launch asks you to choose a vault password (8+ characters, or a long number PIN). Fingerprint unlock is optional, and the password always works as a fallback.
- **Seed list:** a list of your seeds, each with a name (for example "Main TXC", "Cold BTC") and a short fingerprint so you can tell them apart. No balances, no coins, no internet.
- **Add a seed:** make a new random 12 or 24-word seed with a "write it down, then confirm 3 words" step, or type in an existing seed, which is checked for typos. An optional extra passphrase can be saved alongside it.
- **View a seed:** you type your password again, then the app shows the words and a **QR code** of the seed. The screen is blocked from screenshots and covered in the app switcher. It hides itself after 60 seconds.
- **Watch-only QR:** for each seed, a QR of its public TXC / EVM key, so an online wallet can watch it without the words. This is also the first piece of phase 2.
- **Auto-lock:** after 2 minutes idle, and as soon as you leave the app. After 10 wrong passwords there's an increasing wait.
- **Backup:**
  - **Export:** the whole vault becomes one locked backup (HMVAULT format), shown as a QR (animated if large) and/or saved as a file. You choose a backup password, which can be different from the vault password.
  - **Restore:** scan or load a backup and enter its password. Seeds are merged in and duplicates skipped.
  - The **offline unlocker** page (already built) opens backups on any computer, with no app or internet needed.
- **Delete a seed / wipe the vault:** needs the password plus a typed confirmation.

## Truly offline

- The Android app is built with **no internet permission at all**, so the phone's system blocks every connection even if code tried.
- All network code is removed: the wallet, prices, swaps, sign-in, error reporting, update checks, Telegram and card service.
- It's a separate app (`money.honest.seedvault`, "HME Seed Vault") so it installs next to the HME Wallet without touching it.

## Phase 2 readiness (not built now)

- Seed storage keeps the raw words plus derivation info, so a signer can derive TXC/ISK/LTC/BTC keys later.
- A reserved "Sign" screen slot and a QR scan component are kept for later: scan an unsigned transaction (PSBT for TXC-style coins), review it, sign it, then show the signed transaction as an animated QR.

## What gets removed from this copy

The wallet screens, sending, swaps, the Chrome extension, the Tap card, the Seeds trading link, the honest.money profile link, the APK release feed, and every server route. The backend stays switched on but unused.

## Testing before real seeds

1. Build an APK through GitHub (same workflow as before, with a new app id and name).
2. Put dummy seeds in it on the offline phone. Export a backup, wipe, restore, and check the offline unlocker opens the backup.
3. Only then move real seeds over from LastPass, and delete the LastPass notes afterwards.

## Technical details

- Vault storage: one AES-256-GCM blob in app storage. The key comes from PBKDF2-SHA512 at 600k iterations with a random salt, reusing `src/lib/vault/format.ts` (extended into a versioned JSON payload `{v, seeds:[{id,name,words,passphrase?,createdAt,fingerprint}]}`). The decrypted vault is held in memory only while unlocked and cleared on lock.
- Biometric: the existing `src/lib/native/biometric.ts` pattern (Keystore-held password, unlocked behind BiometricAuth), with new storage keys.
- Screenshots: the PrivacyScreen plugin with `preventScreenshots: true` app-wide.
- Android: `patch-android-manifest.mjs` removes `INTERNET` / `ACCESS_NETWORK_STATE` (`tools:node="remove"`), keeps CAMERA, drops deep links. In `capacitor.config.ts`: new appId and appName, no `allowNavigation`, new hostname `vault.local`.
- Routes: `/` (unlock/setup), `/seeds`, `/seeds/new`, `/seeds/$id`, `/backup`, `/vault` (offline unlocker info). Old `wallet.*` and `api/*` routes and their libs are deleted.
- Tests for: vault encrypt/decrypt round trip, wrong password rejected, backup merge skips duplicates, idle auto-lock timing.
- Memory and AGENTS.md updated to say this project is the offline seed vault (no network).
