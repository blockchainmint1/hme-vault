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

Subdirectories (`src/lib/vault`, `src/lib/signer`) have their own `AGENTS.md`; read it before changing files there.

- No network code in the app: no fetch, server functions, API routes, analytics or error reporting. Why: the vault runs on a never-online phone and the APK ships without the INTERNET permission.
- `scripts/patch-android-manifest.mjs` must keep removing INTERNET and every other network permission (including ACCESS_NETWORK_STATE/ACCESS_WIFI_STATE) with `tools:node="remove"` and keep `allowBackup="false"`; the APK provably ships with zero network permissions. The pre-unlock offline checklist reads only permission-free settings and the battery intent; missing settings return unknown, SIM enumeration supports API 28+, and readiness uses a memoized list. Shared checklist logic enforces permanent ignores for SIM/NFC only, rejecting legacy protected preferences; other failures/unknowns require temporary owner override. Why: plugins can merge permissions back in, backups could copy the vault off-phone, and UI-only exceptions cannot safely enforce the checklist.
- On disk there is exactly one encrypted HMVAULT1 blob (`src/lib/vault/vault-context.tsx`); decrypted seeds, secret files, notes, passwords and the unlock password live in memory only and are dropped on lock. Why: a stolen phone image must never hold plaintext.
- Backups and the vault use the open HMVAULT1 format (`docs/seed-vault-format.md`, `src/lib/vault/format.ts`), and `src/lib/vault/standalone.ts` must keep opening every format we write. Why: seeds must stay recoverable without this app.
- Backup export and device import go through the Vault provider, with lock-generation guards and additive merging; exports use the current in-memory unlock credential. Why: copying must never expose the credential, restore plaintext after locking, or overwrite the receiving vault.
- Capacitor `hostname` (`vault.local`) is fixed after release. Why: localStorage is keyed by origin, so changing it orphans installed vaults.
- The Capacitor entry generator reuses the root SPA shell for seed-vault routes only; never prerender removed wallet routes. Why: nonexistent routes return 404 and block APK and web builds.
- Vault rules (lockout, auto-lock, merge, key derivation) live as pure functions in `src/lib/vault/seeds.ts` with tests beside them. Why: security rules stay testable without a UI.
- Pairing stays additive/public-only; Solana exports SLIP-0010 raw ed25519 address/path, never xpubs or chain codes. Receive derives a fixed first public address from pairing accounts on an unlocked offline screen; receiving-only coins never expand signing support. Why: consistent addresses without spending authority or online-wallet features.
- Trigger shared backup reminders after persisted additions; clear on lock/wipe. Why: covers every entry type without retaining secrets.
- Seed comparison shows the first TXC legacy receiving address with its full derivation path, using the signer's shared network definition. Why: owners can verify manual seed entry without sharing recovery words or confusing address formats.
- Android document save/open uses the local VaultDocuments SAF plugin installed by the manifest patch script, without broad storage permissions. Why: owners can choose a USB drive without granting access to the entire device.
- Coin QR credentials accept any scanned content, normalized locally in coin-unlock.ts when they are seeds or keys, and used as the ordinary HMVAULT1 password; CredentialInput composes complete coin-plus-word credentials for sensitive confirmations, with independent optional-word handling for source backups. Why: every confirmation must work with the same encryption credential without confusing source and receiving keys.
- Fingerprint enrollment verifies the combined coin-and-extra-word credential and seals it through the native biometric module. Why: fingerprint recovery must release the same credential that encrypts the vault.
- Setup guidance lives on a public static tutorial route linked from the web-only homepage blurbs, with no fetching or native external navigation. Why: owners can prepare their offline device without introducing network features into Vault.
- The app never imports the backend client (src/start.ts has no auth middleware); backend tables stay RLS-locked with no policies. Why: the offline vault must not ship or use the backend key path.
- New typed passwords (vault, seed lock, transfer, password change) must pass `assessPassword`, enforced at the format boundary by `lockTypedText`; coin credentials use `lockText` and are exempt, and any scanned QR is accepted by owner design (audit M1 is declined, not open). Why: a copied blob is only as strong as its password.
- Android builds require minSdk 28, exclude all data via dataExtractionRules, pin workflow actions to commit SHAs and number versionCode by run. Why: per the 2026-10-18 security review.
- Offline signing policy and its tests live under `src/lib/signer`; unsupported swap data must fail closed, fee checks cannot be bypassed, and signatures must be bound to the reviewed request. Why: online preparation does not establish safe swap semantics on an offline device.
- The web build shows `WebDemoBanner` on every screen and the footer publishes the APK SHA-256 and signing-certificate SHA-256 from `src/lib/release.ts`, updated with every APK asset swap. Why: the browser lacks the phone's protections and sideloaders need a way to verify the APK.
- CI (`ci.yml`) and the APK workflow run prettier --check, eslint, tsc and vitest before building. Why: an APK must never be built from code that fails its safety tests.
- Changing the vault credential always disables fingerprint unlock inside `changePassword`, and `unlock` discards results if Vault locked during key derivation. Why: a sealed old credential or a late unlock must never reopen secrets.
