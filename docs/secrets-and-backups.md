# Vault — secrets, keystores and three-device backups

## Computer → offline Vault

1. On Vault, open **Secrets → Import → Save computer transfer page**. Copy `vault-transfer.html` to the computer by USB.
2. Disconnect the computer. Open that HTML file in a modern browser; it needs no internet.
3. Choose the `.jks` file, give it a name, and choose a transfer password twice. Select **Encrypt and show QR**.
4. On the offline phone, **Secrets → Import → Scan transfer QR**. Keep scanning until every part arrives. Enter the transfer password and import.
5. Import `secrets.txt` as a separate file or store its passwords as named passwords/notes. The keystore alone is not enough to sign updates; keep the alias and both passwords too.
6. Verify you can open and recover the dummy file before handling real signing material. Close the computer page after use.

Each file is limited to 256 KiB. Cycling hundreds of frames is slow; USB encrypted-file import is faster for large files. The entire vault has a 2 MiB JSON-character limit. No cloud sync or online account is involved.

## Whole-vault backup

**Backup → Save file / USB** includes every seed, password, note, file and authenticator account. It encrypts with the current Vault unlock credential; no separate backup password is chosen. On Android, the save button opens the system file picker: choose a connected USB drive if Android supports and mounts it. Otherwise save locally and copy the encrypted `.txt` file to USB. On a computer browser, normal downloads apply.

For device copying, use **Backup → Send QR → Show encrypted QRs** on the source. On a spare Vault, first set up its own unlock credential, then **Backup → Receive → Scan transfer QR** (or open a saved encrypted file). When both devices use the same credential, select **Import into this Vault**, or approve with fingerprint when enabled. If the source uses another key, select **Different key or older backup?** and scan its secret QR or enter its password. Older backups still use the separate backup password chosen when they were made. Existing seeds and identical secrets are skipped; nothing is overwritten or deleted. Names of duplicate entries are not updated. Each device retains its own unlock credential and fingerprint enrollment. These are independent copies, not automatic syncing. Repeat after adding entries; large collections are faster by USB.

Android may lock Vault when you open the system file picker. After choosing the backup, unlock and return to **Backup → Receive** (or **Secrets → Import**); only the encrypted code waits in memory. No plaintext is kept while locked.

## Recovery without this app

Save the **offline unlocker** beside the backup. Open it offline, load the encrypted `.txt`, and enter the unlock credential used when that backup was made (the normalized secret QR text or password; older backups use their original backup password). It shows words/passwords/notes and authenticator setup secrets and offers exact-byte downloads for files. Those recovered downloads are **unencrypted**; handle them accordingly. Never scan the seed QR into an online device for watch-only pairing.

Changing the Vault unlock credential does not re-encrypt existing backups. Keep the original secret coin/key to recover those backups, stored separately from the USB. Fingerprint alone cannot recover on another device. Encryption is only as strong as the credential: public QR text is not a strong secret.

## GitHub signing material

The helper no longer prints signing passwords or base64 keys in logs. Its downloadable artifact still contains **unencrypted** signing material and expires after one day. Anyone with access to the artifact can obtain it. Download both files, set the four repository Actions secrets from `secrets.txt`, verify an encrypted Vault backup, then delete the hosted artifact. Local offline generation is safer for permanent keys; changing future workflow code cannot remove exposure from old logs or artifacts.

## Still needs a real-device check

The browser flow and exact dummy-keystore recovery are tested. Build the APK and test the Android USB picker, camera scanning, background lock and restore on your actual offline phone before putting real secrets in Vault. This is not independently audited security software.