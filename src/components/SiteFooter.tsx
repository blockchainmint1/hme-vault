import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isNative } from "@/lib/native/platform";
import vaultApk from "@/assets/vault-apk.apk.asset.json";

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
      </div>
    </footer>
  );
}
