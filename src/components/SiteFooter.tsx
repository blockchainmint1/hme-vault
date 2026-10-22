import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isNative } from "@/lib/native/platform";
import vaultApk from "@/assets/vault-apk.apk.asset.json";
import { APK_SHA256, APK_VERSION, SIGNING_CERT_SHA256 } from "@/lib/release";

/** Web-only footer. The offline phone app has no external links at all. */
export function SiteFooter() {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNative()), []);
  if (native) return null;
  return (
    <footer className="border-t border-border/60 py-6 mt-8">
      <div className="mx-auto max-w-xl px-4 space-y-2 text-sm text-muted-foreground">
        <p>
          Part of the{" "}
          <a
            href="https://honest.money"
            target="_blank"
            rel="noreferrer"
            className="text-foreground hover:underline"
          >
            honest.money
          </a>{" "}
          ecosystem
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-1">
          <a
            href={vaultApk.url}
            download="hme-vault-release.apk"
            className="text-foreground hover:underline"
          >
            APK
          </a>
          <a
            href="https://github.com/blockchainmint1/hme-vault"
            target="_blank"
            rel="noreferrer"
            className="text-foreground hover:underline"
          >
            GitHub
          </a>
          <Link to="/legal/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link to="/legal/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/manifesto" className="hover:text-foreground">
            Manifesto
          </Link>
        </nav>
        <details className="text-xs">
          <summary className="cursor-pointer">Verify the APK before installing</summary>
          <div className="mt-2 space-y-1 break-all font-mono">
            <p>Version {APK_VERSION}</p>
            <p>File SHA-256: {APK_SHA256}</p>
            <p>Signing certificate SHA-256: {SIGNING_CERT_SHA256}</p>
          </div>
          <p className="mt-1">
            Check with <code>sha256sum</code> and <code>apksigner verify --print-certs</code>.
            Don&apos;t install if either value differs.
          </p>
        </details>
      </div>
    </footer>
  );
}
