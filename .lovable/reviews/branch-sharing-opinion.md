# Auditor's branch-sharing opinion vs. what's already built

The auditor reviewed our plan, not the code. Here is each point against the screen we built today.

| # | Auditor asks for | Status today | Breaks anything? |
|---|---|---|---|
| 1 | A built-in profile per service with its own trusted key, pocket, coin list and name | **Done.** Seeds is one profile; its trusted key is empty, so it refuses everything for now. Missing: a test proving no key exists outside a reviewed profile. | No |
| 2 | Only hand over a sealed-off account key; refuse pocket 0, shallow keys, non-sealed pockets, or any parent key — each with a test | **Covered indirectly:** Vault only accepts Seeds' exact 16-path list for pocket 1106. Missing: a separate guard that would stop a *future* service profile from asking for something unsafe, plus one test per refusal. | No |
| 3 | Scope checked before the approval screen; approve all or nothing | **Done.** Wrong scope is refused before any key is made; no partial approval. | — |
| 4 | Coin list frozen; changes need a new version on all sides | **Done.** | — |
| 5 | Plain-words approval screen with a mandatory consequence sentence; exact paths available on tap | **Mostly done.** Would reword to "can *spend* from this pocket until you move the coins; revoking on Seeds does not take the keys back", and add a "Show exact paths" tap. | No |
| 6 | A private record: "pocket 1106 of seed X shared with Seeds on date Y" | **Not built.** Would live inside the encrypted Vault (like the existing "copy given" date), show on the seed, travel in your own backups, never in shared copies. | No — older backups still open |
| 7 | Bind the request into the sealed answer in a *future* version | Not needed now; needs Seeds and Seeds Key to change too. Recommend writing it down as reserved for the next version only. | Would break Seeds if done now |
| 8 | Rename "Share branch access" to "Share a trading pocket" | Button/title wording only. | No |

**My recommendation:** do 1, 2, 5, 6 and 8 now; write 7 down as a future item. Nothing here goes live until Seeds supplies its verified signing key either way.
