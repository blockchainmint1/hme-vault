import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SweepReview } from "@/lib/signer/sweep";

export function SweepPaymentReview({
  review: r,
  onListEnd,
}: {
  review: SweepReview;
  onListEnd?: () => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const check = () => {
    const el = list.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 4) onListEnd?.();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(check, [r]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Sweep {r.rows.length} payments on {r.chainName} from “{r.seedName}”
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Everything goes to</p>
          <p className="break-all font-mono text-sm">{r.destination}</p>
          <p
            className={
              r.ownIndex === null
                ? "text-sm font-semibold text-destructive"
                : "text-sm font-medium text-primary"
            }
          >
            {r.ownIndex === null
              ? "External address (not one of this seed's addresses)"
              : `Your own address #${r.ownIndex}`}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Totals</p>
          <ul className="space-y-1 text-sm">
            {r.totals.map((t) => (
              <li key={t.asset}>
                <span className="font-medium">{t.amountLabel}</span>
                <span className="block break-all font-mono text-xs text-muted-foreground">
                  {t.asset}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm">
          Total maximum network fee: <span className="font-semibold">{r.totalFeeLabel}</span>
        </p>
        <ol
          ref={list}
          onScroll={check}
          aria-label="Every payment in this sweep"
          className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-2"
        >
          {r.rows.map((p, i) => (
            <li key={`${p.from}-${p.nonce}`} className="text-sm">
              <span className="text-muted-foreground">
                {i + 1}. Address #{p.index} · nonce {p.nonce}
              </span>
              <span className="block font-medium">
                {p.amountLabel}
                {p.unknownToken && <span className="text-destructive"> (unknown token)</span>}
              </span>
              <span className="block break-all font-mono text-xs">{p.from}</span>
              <span className="block break-all text-xs text-muted-foreground">
                {p.asset} · max fee {p.feeLabel}
                {p.spendLabel && ` · amount + fee ${p.spendLabel}`}
              </span>
            </li>
          ))}
        </ol>
        {r.warnings.map((w) => (
          <p key={w} className="flex gap-2 rounded-md border border-destructive/50 p-2 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            {w}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
