# Seed Vault format (HMVAULT1)

Open format so anyone can recover a seed without our app, licence or internet.

```
HMVAULT1.<iterations>.<salt>.<iv>.<ciphertext>
```
All binary fields are base64url without padding.

1. key = PBKDF2-HMAC-SHA512(password normalized NFKD, salt (16 bytes), iterations (default 1000000 since 2026-10-22; older files use 600000 and still open — readers must honour the stored count)), 32 bytes
2. plaintext = AES-256-GCM-decrypt(key, iv (12 bytes), ciphertext incl. 16-byte tag, AAD = ASCII "HMVAULT1")
3. plaintext is UTF-8: either legacy lowercase BIP39 words separated by single spaces, or a JSON Vault payload:

```json
{"v":1,"kind":"hm-seed-vault","seeds":[],"secrets":[]}
```

Seeds contain `id,name,words,passphrase?,fingerprint,createdAt`. The optional `secrets` array contains `id,name,type,content,filename?,createdAt`. Types are `password`, `note`, and `file`. Text is preserved verbatim; file content is standard padded base64 of the exact file bytes, with the original filename. Older JSON without `secrets` means an empty secrets array. File limit: 256 KiB; whole plaintext vault: 2 MiB in JSON characters. Restore merges without overwriting; identical seed words/passphrase and identical secret type/content/filename are skipped. Dates are Unix milliseconds.

QR transport is separate from encryption: a short code is sent verbatim, longer codes use `HMQR2:<8-hex content label>:<part>/<total>:<chunk>`. Chunks default to 600 characters. The label is a 32-bit FNV-1a checksum (not a security signature); AES-GCM verifies authenticity on decryption. Legacy `HMQR:<part>/<total>:<chunk>` is still accepted. Conflicting parts and mixed labels are rejected.

The computer transfer page encrypts a payload with an empty seed list and one secret, so it uses exactly the same recovery format as a full backup. Never put unencrypted keystores or passwords into a transfer QR. Plaintext file export is a deliberate password-gated action, not a backup.

Reference code: `src/lib/vault/format.ts`; single-file offline unlocker: `src/lib/vault/standalone.ts`.

Whole-vault exports use the current Vault unlock credential as the HMVAULT1 password, with fresh random salt and IV. QR device copies and USB files contain the same format. Older backups made with a separate backup password remain readable using that password. Receiving devices decrypt with the source credential and additively merge into their own vault, encrypted under their own credential. No credential or fingerprint enrollment is included in the payload.
