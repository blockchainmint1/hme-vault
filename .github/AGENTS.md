# .github — rules

- The APK versionName is the hand-set `version` in package.json (X.Y.Z), raised in the same commit as any app change meant for a new APK; the workflow refuses a version equal to the website's `APK_VERSION`, and a test keeps it never older. Why: the owner must know the exact version before building, and two different APKs must never share a number.
