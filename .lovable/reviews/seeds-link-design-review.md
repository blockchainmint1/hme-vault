# Older auditor design review: "Seeds link, pocket 1106" (rev 45)

This review was written **before** the trading-pocket screen was built. The screen we built since then (commit `ccc7d0d`) already covers most of it. Here is where each of the 10 conditions stands today.

| # | Auditor condition | Status today |
|---|---|---|
| 1 | Pin Seeds' key; the host name is only a label | **Done (a stronger way).** Seeds has to sign every request with a key built into Vault. That signature covers the sealing key, so a phishing page can't swap in its own. The built-in key list is still empty until Seeds sends its verified key, so every real request is refused for now. |
| 2 | Hands-off seeds can't use it | **Done**, with a test. Seeds with a passphrase are blocked too. |
| 3 | Confirm like "Give a copy": **type the seed's name** plus password or fingerprint, and keep a dated record | **Partly done.** Password/fingerprint: done. Encrypted dated record (`pocketShares`), kept out of shared copies: done. **Typing the seed's name: not done.** |
| 4 | Hash-pin the copied Seeds Key files; one known address per chain; no path can reach account 0 | **Partly done.** Known address for all 16 chains: done. Account-0 / hardened-path guard: done. **Fingerprint test on the copied files: not done.** |
| 5 | Wipe keys after use; clear the screen on close or lock | **Done.** Keys are wiped after use. The answer clears on Cancel/Done, and locking sends you back to the lock screen. |
| 6 | 240-character QR pieces | **Done.** |
| 7 | Refuse requests that expire more than 24 hours out | **Done (stricter).** A request can last at most 10 minutes. |
| 8 | Wording: "all 16 chains… can't take them back… savings stay on this phone" | **Nearly done.** The screen covers all three points, but doesn't say "all 16 chains" in the main sentence (they're listed under "Show exact paths"). |
| 9 | Record the exception in the developer rules | **Done** (signer rules: "Branch access"). |
| 10 | Round-trip and refusal tests | **Done**: unpinned key, wrong host, wrong pocket, hands-off, too-long expiry, lapsed request, altered scope. The round trip opens the answer with the same steps Seeds Key uses. |

## Three small gaps still open
- **A. Type the seed's name before handing over** (#3). Matches "Give a copy". About 15 lines and one test.
- **B. Fingerprint test on the copied Seeds Key files** (#4). If anyone edits those files, a test fails. Test-only change.
- **C. Say "all 16 chains" on the approval screen** (#8). One sentence.

None of these change what gets shared, the 1106-only limit, or the Seeds signing-key requirement. Real requests stay blocked until Seeds' verified signing key is built in.
