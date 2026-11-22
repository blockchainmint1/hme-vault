# Seeds linking: assessment before implementation

The basic design fits: Vault stays offline, and only trading pocket **1106** leaves as encrypted keys. The recovery phrase and savings keys stay on the phone. Seeds then has authority to spend from that trading pocket without asking Vault again.

## One decision before building

The proposed QR checks the **written names** `key.seeds.honest.money` and `seeds.honest.money`, but it contains no proof that Seeds produced it. Someone could write those same names into a QR while substituting their own encryption key. They could then decrypt the trading keys even if the real Seeds page refuses the answer later.

The three-digit match code is based only on the challenge, not the encryption key. It helps match screens, but does not close this gap.

**Recommended:** SEEDS signs the whole request, including its one-time encryption key, and Vault verifies it against a trusted public key included with the app. This keeps Vault offline, but needs a coordinated change in the other projects before real use.

**Existing alternative:** require you to verify the real Seeds page's address and match code before approving. This preserves today's proposed exchange, but cannot promise that only Seeds can decrypt a substituted request.

## Safeguards either way

- Only pocket 1106 and the specified 16 key families; never savings keys or recovery words.
- No delegation from hands-off seeds: sending spending keys is an export, not watch-only pairing.
- Respect an existing seed passphrase. The reference currently ignores it; never silently link a different wallet.
- Keep replies at **240 characters per QR part**, using Vault's existing scanner and rotating codes.
- Credential or fingerprint confirmation, explicit spending-authority warning, and no late response after lock or closing the screen.
- Keep the existing signer libraries stable rather than upgrading every payment signer for this integration.

No app code, APK or published download has changed. The detailed auditor file includes source references and verification limits.