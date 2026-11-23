# .github — rules

- The APK versionName is the hand-set `version` in package.json (X.Y.Z), raised in the same commit as any app change meant for a new APK; the workflow refuses a version older than the website's announced `APK_VERSION` (equality is fine — the website may announce a version before its APK is built and swapped in), and a test keeps it never older. Why: the owner must know the exact version before building, and a build must never be older than what the website announces.
