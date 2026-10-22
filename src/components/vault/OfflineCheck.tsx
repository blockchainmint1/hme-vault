import { useEffect, useState } from "react";
import { Check, X, HelpCircle, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applyIgnoredChecks,
  needsOverride,
  offlineChecklist,
  readIgnoredChecks,
  readRadioStatus,
  setCheckIgnored,
  type CheckItem,
} from "@/lib/native/offline-check";

/**
 * Phone-only checklist shown above the unlock form. Calls onReady(true) when all
 * checks pass or the owner chooses "Open anyway". Rechecks when the app returns
 * to the foreground (after the owner flips switches in Android settings).
 * A failing row can be permanently ignored (e.g. a built-in eSIM that can't be
 * removed); the choice is stored in localStorage and holds no secrets.
 */
export function OfflineCheck({ onReady }: { onReady: (ready: boolean) => void }) {
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [native, setNative] = useState<boolean | null>(null);
  const [override, setOverride] = useState(false);
  const [ignored, setIgnored] = useState<string[]>(() => readIgnoredChecks());

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const s = await readRadioStatus();
      if (!alive) return;
      setNative(s !== null);
      setItems(s ? offlineChecklist(s) : null);
    };
    void run();
    const vis = () => document.visibilityState === "visible" && void run();
    document.addEventListener("visibilitychange", vis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  const shown = items ? applyIgnoredChecks(items, ignored) : null;
  const problem = shown ? needsOverride(shown) : false;
  useEffect(() => {
    if (native === false) onReady(true);
    else if (shown) onReady(!problem || override);
  }, [native, shown, problem, override, onReady]);

  if (!native || !shown) return null;
  return (
    <div
      className={`space-y-2 rounded-md border p-3 text-sm ${problem ? "border-destructive/60" : "border-border"}`}
    >
      <ul className="space-y-1">
        {shown.map((i) => {
          const isIgnored = ignored.includes(i.key) && items?.find((r) => r.key === i.key)?.ok !== true;
          return (
            <li key={i.key} className="flex items-center gap-2">
              {isIgnored ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : i.ok === true ? (
                <Check className="h-4 w-4 text-primary" />
              ) : i.ok === false ? (
                <X className="h-4 w-4 text-destructive" />
              ) : (
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="flex-1">
                {isIgnored
                  ? `${i.label} (always ignored)`
                  : i.ok === false
                    ? i.fix
                    : i.ok === null
                      ? `${i.label} (couldn't check)`
                      : i.label}
              </span>
              {!isIgnored && i.ok === false && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setIgnored(setCheckIgnored(i.key, true))}
                >
                  Always ignore
                </button>
              )}
              {isIgnored && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setIgnored(setCheckIgnored(i.key, false))}
                >
                  Check again
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {problem && !override && (
        <>
          <p className="text-destructive">
            This phone may not be offline. Fix the items above, then come back to Vault.
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={() => setOverride(true)}>
            I understand the risk — open anyway
          </Button>
        </>
      )}
      {problem && override && (
        <p className="text-muted-foreground">Opening anyway, at your own risk.</p>
      )}
      {!problem && (
        <p className="text-muted-foreground">Phone is offline. Proceed to open Vault.</p>
      )}
    </div>
  );
}
