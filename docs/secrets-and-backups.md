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

**Backup → Make a backup** includes every seed, password, note and file. Choose a backup password, then scan the cycling QR with another Vault, or save the encrypted `.txt` file. On Android, the save button opens the system file picker: choose a connected USB drive if Android supports and mounts it. Otherwise save locally and copy the encrypted file to USB. On a computer browser, normal downloads apply.

On a spare Vault, first choose its own vault password; then **Backup → Restore** and scan the QR or open the encrypted file. Enter the backup password. Existing seeds and identical secrets are skipped; nothing is overwritten. These are independent copies, not automatic syncing. Make a new backup after adding anything and restore it to both spares.

Android may lock Vault when you open the system file picker. After choosing the backup, unlock and return to **Backup → Restore** (or **Secrets → Import**); only the encrypted code waits in memory. No plaintext is kept while locked.

## Recovery without this app

Save the **offline unlocker** beside the backup. Open it offline, load the encrypted `.txt`, and enter the backup password. It shows words/passwords/notes and offers exact-byte downloads for files. Those recovered downloads are **unencrypted**; handle them accordingly. Never scan the seed QR into an online device for watch-only pairing.

## GitHub signing material

The helper no longer prints signing passwords or base64 keys in logs. Its downloadable artifact still contains **unencrypted** signing material and expires after one day. Anyone with access to the artifact can obtain it. Download both files, set the four repository Actions secrets from `secrets.txt`, verify an encrypted Vault backup, then delete the hosted artifact. Local offline generation is safer for permanent keys; changing future workflow code cannot remove exposure from old logs or artifacts.

## Still needs a real-device check

The browser flow and exact dummy-keystore recovery are tested. Build the APK and test the Android USB picker, camera scanning, background lock and restore on your actual offline phone before putting real secrets in Vault. This is not independently audited security software.