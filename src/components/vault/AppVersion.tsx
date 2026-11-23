import { useEffect, useState } from "react";
import { isNative } from "@/lib/native/platform";
import { APK_VERSION, versionBuiltOn } from "@/lib/release";

/**
 * Home-screen version line. On the phone it reads the installed APK's own version from Android
 * (nothing is fetched); on the website it names the Android app offered for download, so the two
 * can be compared by eye.
 */
export function AppVersion() {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const show = (label: string, v: string) => {
      const day = versionBuiltOn(v);
      if (live) setLine(`${label} ${v}${day ? ` · built ${day}` : ""}`);
    };
    if (!isNative()) {
      show("Latest Android app:", APK_VERSION);
      return;
    }
    import("@capacitor/app")
      .then(({ App }) => App.getInfo())
      .then((info) => show("Version", info.version))
      .catch(() => live && setLine("Version unknown"));
    return () => {
      live = false;
    };
  }, []);
  if (!line) return null;
  return <p className="mt-2 font-mono text-xs text-muted-foreground">{line}</p>;
}
