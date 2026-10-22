import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — HME Vault" },
      { property: "og:title", content: "Privacy — HME Vault" },
      {
        property: "og:description",
        content: "Privacy policy for offline seed and secret storage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "Privacy policy for the HME Vault. Offline seed and secret storage, without accounts or tracking.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 prose prose-invert">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground no-underline">
        ← Home
      </Link>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Draft — last updated October 22, 2026</p>

      <h2>The short version</h2>
      <ul>
        <li>No account. No email. No password reset.</li>
        <li>No analytics, no tracking pixels, no third-party cookies.</li>
        <li>Your seed phrase is encrypted on your own device and never sent anywhere.</li>
      </ul>

      <h2>What stays on your device</h2>
      <p>
        Seeds, passwords, notes, files and authenticator accounts are encrypted with a key derived
        from your Vault password or coin QR (PBKDF2-SHA512, 1,000,000 iterations, AES-256-GCM) and
        stored only on your device. They are decrypted in memory only while Vault is unlocked.
      </p>

      <h2>What we ask the network</h2>
      <p>
        Nothing. Vault has no network code. The Android app is built without internet permission, so
        the phone itself blocks every connection. Backups leave the device only when you save a file
        or show a QR code yourself.
      </p>

      <h2>The website</h2>
      <p>
        vault.honest.money serves the same app as a demo. Your browser downloads the page from our
        host, which sees ordinary request details such as your IP address. Anything you type there
        stays in your browser&apos;s storage. Never put real seeds in the website version.
      </p>

      <h2>Children</h2>
      <p>The app is not directed to children under 13.</p>

      <h2>Contact</h2>
      <p>
        Questions? Reach out through the{" "}
        <a href="https://honest.money" target="_blank" rel="noreferrer">
          honest.money
        </a>{" "}
        community.
      </p>
    </main>
  );
}
