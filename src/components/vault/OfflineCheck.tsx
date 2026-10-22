import { useEffect, useState } from "react";
import { Check, X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  needsOverride,
  offlineChecklist,
  readRadioStatus,
  type CheckItem,
} from "@/lib/native/offline-check";

/**
 * Phone-only checklist shown above the unlock form. Calls onReady(true) when all
 * checks pass or the owner chooses "Open anyway". Rechecks when the app returns
 * to the foreground (after the owner flips switches in Android settings).
 */
export function OfflineCheck({ onReady }: { onReady: (ready: boolean) => void }) {
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [native, setNative] = useState<boolean | null>(null);
  const [override, setOverride] = useState(false);

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

  const problem = items ? needsOverride(items) : false;
  useEffect(() => {
    if (native === false) onReady(true);
    else if (items) onReady(!problem || override);
  }, [native, items, problem, override, onReady]);

  if (!native || !items) return null;
  return (
    <div
      className={`space-y-2 rounded-md border p-3 text-sm ${problem ? "border-destructive/60" : "border-border"}`}
    >
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2">
            {i.ok === true ? (
              <Check className="h-4 w-4 text-primary" />
            ) : i.ok === false ? (
              <X className="h-4 w-4 text-destructive" />
            ) : (
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            )}
            <span>{i.ok === false ? i.fix : i.ok === null ? `${i.label} (couldn't check)` : i.label}</span>
          </li>
        ))}
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
      {problem && override && <p className="text-muted-foreground">Opening anyway, at your own risk.</p>}
      {!problem && <p className="text-muted-foreground">Phone is offline. Proceed to open Vault.</p>}
    </div>
  );
}
