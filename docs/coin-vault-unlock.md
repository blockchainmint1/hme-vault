# Hidden coin QR unlock

Vault accepts the existing Cold Storage Coins hidden BIP39 seed QR (plain English words or Standard SeedQR) as a local master password. Public coin address/AssetID labels cannot unlock Vault. No coin registry request, account sign-in, network verification, balance check or ownership claim is involved; the two coin projects are unchanged.

## Setup and existing Vaults

- New Vault: select **Coin QR**, acknowledge the shared-secret risk and recovery requirement, scan the same hidden QR twice, then confirm.
- Existing Vault: **Settings → Coin QR unlock → Link a coin**, enter or scan the current password, acknowledge the risks and scan the new coin twice. This re-encrypts the existing collection atomically, preserving seeds and secrets. The old password stops unlocking that phone.
- Optional **extra secret word**: during enrollment you can add a typed word that is combined with the scanned credential (`coin + "\n" + word`). Unlocking then needs both the physical coin scan and the word — something you have plus something you know. A non-secret flag (`hmsv.coin-extra` in localStorage) records that a word is required so the lock screen asks for it after a scan. There is no reset: losing either half loses access.
- Scan the hidden QR on the lock screen to unlock. Sensitive actions still need separate confirmation; their password fields offer a camera button. Scanning only fills the credential—it does not automatically approve payments, reveal secrets or delete data.
- Fingerprint enrollment accepts the coin QR and, when configured, asks for the extra secret word. Both are verified together and the complete credential is sealed in Android Keystore behind a strong biometric check. Fingerprint alone then opens that phone’s Vault; recovery on another device still requires the coin plus word. Linking a different coin disables previous fingerprint access; re-enroll explicitly if desired. This does not protect against a compromised app while Vault is unlocked.

## Recovery and risk

The password is the normalized lowercase recovery words separated by single spaces, with no extra BIP39 passphrase. HMVAULT1 is unchanged, so the same words can be entered manually in an offline recovery tool. The scan does not add the coin as a stored seed.

Anyone holding those words—including someone who retained minting output files—can spend the coin and decrypt a copy of this phone's Vault. A static printed QR is copyable; it is not a challenge-response hardware security key or proof of physical possession. Revealing a sealed coin's secret may alter its cold-storage status.

Full backups keep their separately chosen backup password. Changing the phone's unlock credential does not change old backups. Keep an independent encrypted backup, its password and a secure recovery copy of the coin words. Losing the coin without those recovery methods can permanently lose access. Fingerprints do not restore onto another phone.

## Verification

Tests cover BIP39/Standard SeedQR normalization, rejecting public identifiers, explicit consent, matching second scan and HMVAULT1 recovery. Browser camera tests with a dummy QR verify setup, lock/unlock, saving and revealing a dummy secret, and rekeying an existing Vault with rejection of the former password. Android camera, fingerprint and USB recovery still require actual-device testing.