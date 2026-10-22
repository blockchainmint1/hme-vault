<p align="center">
  <img src="src/assets/brand/vault-mark-256.png" alt="HME Vault" width="128" />
</p>

<h1 align="center">HME Vault</h1>

<p align="center">
  <strong>Your seeds, locked on a phone that never goes online.</strong><br />
  Offline seed storage, secrets, 2FA codes and airgapped transaction signing — open source, open format, no accounts.
</p>

<p align="center">
  <a href="https://vault.honest.money">vault.honest.money</a> ·
  <a href="https://vault.honest.money/tutorial">Setup tutorial</a> ·
  <a href="https://vault.honest.money/supported">Supported transactions</a> ·
  <a href="SECURITY-AUDIT.md">Security status</a>
</p>

---

## Why Vault exists

Most people keep their recovery words in a password manager, a screenshot, or a piece of paper in a drawer. Hardware wallets help, but they hold one seed, need their own app, and rarely understand smaller networks.

HME Vault turns a spare Android phone into a dedicated, **permanently offline** safe for every seed you own — and lets you spend from those seeds without ever exposing them to the internet.

It is part of the [Honest Money Ecosystem](https://honest.money) (TXC, ISK, ZCU and friends).

## What it does

- **Stores many seeds.** Create new 12- or 24-word BIP-39 seeds from full-strength randomness, or enter existing ones (typed or scanned from a SeedQR). Name them, view them, show them as a QR.
- **Verifies what you typed.** Each seed shows its first TXC receiving address and full derivation path, so you can confirm a manual copy matches — without ever sharing the words.
- **Keeps your other secrets too.** Passwords, secure notes, small files (like Android signing keystores) and an offline **authenticator** for 6/8-digit 2FA codes.
- **Signs transactions airgapped.** An online wallet makes an unsigned payment QR; Vault scans it, shows a plain-English review (amount, recipient, fee), signs it, and shows the signed QR back. Supports **TXC, ISK, BTC, LTC, DOGE** and **EVM** native/ERC-20 transfers, including TSD token amounts.
- **Watch-only pairing.** Share public keys by QR so an online wallet can show balances and receive — no secrets leave the phone.
- **Unlocks with a coin.** Use a Cold Storage Coin's hidden QR as a high-entropy master password, plus optional fingerprint unlock sealed in Android security hardware.
- **Backs up simply.** One encrypted file for a USB drive, or animated QR codes to copy everything to a second phone. Imports merge — nothing is overwritten.

## Why it's safe by design

| Protection | How |
| --- | --- |
| No internet, ever | The Android app ships **without the INTERNET permission** — the operating system blocks every connection |
| Encrypted at rest | One AES-256-GCM blob, key from PBKDF2-SHA512 at 1,000,000 rounds |
| Nothing lingers | Decrypted data lives in memory only and is wiped on lock (2 min idle, or the moment you leave the app) |
| No leaks | Screenshots and app-switcher previews blocked; no cloud backups; no analytics or crash reporting |
| Guessing is slow | Increasing waits after repeated wrong unlocks |
| Fingerprint done right | Credential sealed by an Android Keystore key, released only after a strong biometric match, invalidated if fingerprints change |
| Careful signing | Every input checked against your seeds, per-coin fee caps, unreadable data outputs blocked, signature bound to exactly what you reviewed |
| Built from passing code | Every push and every APK build runs formatting, lint, type and safety-test gates |

## Recoverable without us

Backups use the open **HMVAULT1** format, documented in [`docs/seed-vault-format.md`](docs/seed-vault-format.md). A standalone offline recovery page can open any backup on any computer — no app, no account, no internet. If this project disappeared tomorrow, your seeds would not.

## Recommended setup

1. A **Pixel 10a** running [GrapheneOS](https://grapheneos.org/) — no SIM, no accounts, Wi-Fi off.
2. Install the Vault APK (verify its SHA-256 and signing certificate, published in the site footer).
3. Optionally, a [Cold Storage Coin](https://blockchainmint.com/) as your master credential.
4. **Practice with dummy seeds first**: back up, wipe, restore on a second device — then move real ones.

Full walkthrough: [vault.honest.money/tutorial](https://vault.honest.money/tutorial).

## Status

Vault is under active development and independent security review. Read [`SECURITY-AUDIT.md`](SECURITY-AUDIT.md) for current findings and open items. The web version at vault.honest.money is a **demo only** — real seeds belong on the offline phone.

## For developers

Built with React, TanStack Start, Tailwind and Capacitor (Android).

```sh
npm i
npm run dev      # web demo
npx vitest run   # safety tests
```

Android builds run through GitHub Actions (`.github/workflows/android-apk.yml`). See [`ANDROID.md`](ANDROID.md) and [`CAPACITOR.md`](CAPACITOR.md). Project rules for contributors live in [`AGENTS.md`](AGENTS.md).

---

<p align="center"><sub>Honest money. Self custody. Open code. No middlemen.</sub></p>
