import { useMemo } from "react";
import { cn } from "@/lib/utils";

/** Above this many parts, individual dots would flood the scan dialog's DOM. */
const MAX_DOTS = 120;

/**
 * Progress for a numbered QR transfer: one dot per part while that stays cheap,
 * otherwise a single bar plus the count. Either way the missing numbers still
 * list once twelve or fewer remain.
 */
export function PartDots({ total, received }: { total: number; received: number[] }) {
  const got = useMemo(() => new Set(received), [received]);
  const missing = useMemo(() => {
    if (total - got.size > 12) return [];
    const m: number[] = [];
    for (let i = 1; i <= total; i++) if (!got.has(i)) m.push(i);
    return m;
  }, [got, total]);
  return (
    <div className="mt-3 space-y-2">
      {total <= MAX_DOTS ? (
        <div className="flex flex-wrap gap-1" aria-label={`${got.size} of ${total} parts captured`}>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              title={`Part ${i + 1}`}
              className={cn(
                "h-2.5 w-2.5 rounded-full border transition-colors",
                got.has(i + 1) ? "bg-primary border-primary" : "bg-muted border-border",
              )}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={got.size}
            aria-label={`${got.size} of ${total} parts captured`}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, (got.size / total) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {got.size} of {total} parts
          </p>
        </div>
      )}
      {missing.length > 0 && missing.length <= 12 && <p>Still missing: {missing.join(", ")}</p>}
    </div>
  );
}
