import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isNative } from "@/lib/native/platform";

/** Audit H2: the browser build is a demo. Shown on every web screen, never in the offline phone app. */
export function WebDemoBanner() {
  const [web, setWeb] = useState(false);
  useEffect(() => setWeb(!isNative()), []);
  if (!web) return null;
  return (
    <div
      role="note"
      className="sticky top-0 z-40 border-b border-destructive/40 bg-background px-4 py-2 text-center text-xs text-foreground"
    >
      <span aria-hidden className="absolute inset-0 bg-destructive/10" />
      <span className="relative">
        <strong>Demo only.</strong> This browser version is online and lacks the phone&apos;s
        protections. Never put real seeds here — they belong on the offline phone.{" "}
        <Link to="/tutorial" className="underline">
          Set up the phone
        </Link>
      </span>
    </div>
  );
}
