import type { CapacitorConfig } from "@capacitor/cli";

/**
 * HME Seed Vault — offline Android seed storage.
 *
 * SECURITY: always bundled (never `server.url` in a release). The app has no
 * internet permission (see scripts/patch-android-manifest.mjs), so it could
 * not load remote code anyway. `HME_REMOTE_URL` is for local dev only.
 *
 * `hostname` fixes the storage origin: the encrypted vault lives in
 * localStorage, which is keyed by origin. Never change it after release
 * without a migration, or installed vaults become unreadable.
 */
const REMOTE_URL = process.env.HME_REMOTE_URL;

const config: CapacitorConfig = {
  appId: "money.honest.seedvault",
  appName: "HME Vault",
  webDir: "dist/client",
  backgroundColor: "#ffffff",
  server: {
    ...(REMOTE_URL ? { url: REMOTE_URL } : {}),
    hostname: REMOTE_URL ? new URL(REMOTE_URL).hostname : "vault.local",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#ffffff",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 600,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    PrivacyScreen: {
      // App-wide: no screenshots, no screen recording, blank in the app switcher.
      enable: true,
      preventScreenshots: true,
    },
  },
};

export default config;
