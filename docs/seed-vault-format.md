# Seed Vault format (HMVAULT1)

Open format so anyone can recover a seed without our app, licence or internet.

```
HMVAULT1.<iterations>.<salt>.<iv>.<ciphertext>
```
All binary fields are base64url without padding.

1. key = PBKDF2-HMAC-SHA512(password normalized NFKD, salt (16 bytes), iterations (default 600000)), 32 bytes
2. plaintext = AES-256-GCM-decrypt(key, iv (12 bytes), ciphertext incl. 16-byte tag, AAD = ASCII "HMVAULT1")
3. plaintext is the lowercase BIP39 words separated by single spaces (UTF-8)

Reference code: `src/lib/vault/format.ts`; single-file offline unlocker: `src/lib/vault/standalone.ts`.
