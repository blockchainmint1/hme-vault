# src/components/vault — rules

- `PartDots` draws one dot per QR part only up to 120 parts; above that it draws a single progress bar with the count. Why: a scanned frame may declare up to `MAX_PARTS` (13,108) parts, and thousands of DOM nodes rebuilt on every captured frame would stall the phone camera mid-scan.
- Scanner progress widgets stay display-only: they may show part numbers and counts already printed in each frame header, never transfer contents, keys or credentials. Why: the dialog is open while the owner is mid-scan and must not leak what is being collected.
- `AppVersion` (home screen) reads the installed APK's version from Android at runtime (`@capacitor/app` getInfo) and, on the website, `APK_VERSION` from `src/lib/release.ts`; never bake a build-time version into the web bundle. Why: owners compare the phone with the website by eye, and the bundle must stay byte-identical to a clean build for APK verification.
