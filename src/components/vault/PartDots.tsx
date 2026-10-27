import { useMemo } from "react";
import { cn } from "@/lib/utils";

/** One small dot per QR part; filled once that numbered part has been captured. */
export function PartDots({ total, received }: { total: number; received: number[] }) {
  const got = useMemo(() => new Set(received), [received]);
  const missing = useMemo(() => {
    const m: number[] = [];
    for (let i = 1; i <= total; i++) if (!got.has(i)) m.push(i);
    return m;
  }, [got, total]);
  return (
    <div className="mt-3 space-y-2">
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
      {missing.length > 0 && missing.length <= 12 && <p>Still missing: {missing.join(", ")}</p>}
    </div>
  );
}
