<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# HME Seed Vault — project rules

This project is the offline seed vault (remixed from HME Wallet). The everyday wallet lives in its own project; never re-add wallet, price, swap, sign-in or server features here.

- No network code in the app: no fetch, server functions, API routes, analytics or error reporting. Why: the vault runs on a never-online phone and the APK ships without the INTERNET permission.
- `scripts/patch-android-manifest.mjs` must keep removing every network permission with `tools:node="remove"` and keep `allowBackup="false"`. Why: plugins can merge INTERNET back in, and cloud backups would copy the vault off the phone.
- On disk there is exactly one encrypted HMVAULT1 blob (`src/lib/vault/vault-context.tsx`); decrypted seeds and the password live in memory only and are dropped on lock. Why: a stolen phone image must never hold plaintext.
- Backups and the vault use the open HMVAULT1 format (`docs/seed-vault-format.md`, `src/lib/vault/format.ts`), and `src/lib/vault/standalone.ts` must keep opening every format we write. Why: seeds must stay recoverable without this app.
- Capacitor `hostname` (`vault.local`) is fixed after release. Why: localStorage is keyed by origin, so changing it orphans installed vaults.
- Vault rules (lockout, auto-lock, merge, key derivation) live as pure functions in `src/lib/vault/seeds.ts` with tests beside them. Why: security rules stay testable without a UI.
- Phase 2 (air-gapped PSBT signing by QR) builds on `deriveKeys` and the existing QR scanner, not on any online code.
