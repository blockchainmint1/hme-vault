import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvmReview } from "@/lib/signer/evm";

export function EvmPaymentReview({
  review: r,
  onListEnd,
}: {
  review: EvmReview;
  onListEnd?: () => void;
}) {
  const q = r.request;
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
          {r.chainName} from “{r.seedName}”
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-lg font-semibold">{r.amountLabel}</p>
        {r.payouts ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Bulk payment via Disperse (pinned) · {r.payouts.length} recipients · contract {q.to}
            </p>
            <p className="text-sm font-medium">
              If any recipient cannot receive, the whole payment fails and nothing is sent.
            </p>
            <ol
              ref={list}
              onScroll={check}
              aria-label="Every recipient and amount"
              className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-2"
            >
              {r.payouts.map((p, i) => (
                <li key={p.address} className="text-sm">
                  <span className="text-muted-foreground">{i + 1}. </span>
                  <span className="font-medium">{p.amountLabel}</span>
                  <span className="block break-all font-mono text-xs">{p.address}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div>
            <p className="text-xs text-muted-foreground">Pay to</p>
            <p className="break-all font-mono text-sm">{q.to}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground">From</p>
          <p className="break-all font-mono text-sm">{q.from}</p>
        </div>
        {q.kind === "erc20-transfer" && (
          <div>
            <p className="text-xs text-muted-foreground">Token contract</p>
            <p className="break-all font-mono text-sm">{q.token}</p>
          </div>
        )}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Chain ID</dt>
          <dd className="text-right break-all">{q.chainId}</dd>
          <dt className="text-muted-foreground">Nonce</dt>
          <dd className="text-right">{q.nonce}</dd>
          <dt className="text-muted-foreground">Gas limit</dt>
          <dd className="text-right">{q.gas}</dd>
          <dt className="text-muted-foreground">Fee per gas (base units)</dt>
          <dd className="text-right break-all">{q.gasPrice ?? q.maxFeePerGas}</dd>
          {q.type === "eip1559" && (
            <>
              <dt className="text-muted-foreground">Priority fee (base units)</dt>
              <dd className="text-right break-all">{q.maxPriorityFeePerGas}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Maximum gas fee</dt>
          <dd className="text-right break-all font-medium">{r.feeLabel}</dd>
          <dt className="text-muted-foreground">Native amount + gas</dt>
          <dd className="text-right break-all">{r.totalLabel}</dd>
        </dl>
        <p className="text-xs text-muted-foreground break-all">
          {q.path} · {q.type}
        </p>
        <p className="text-sm text-muted-foreground">
          Gas ceiling only; this offline phone cannot check balances, nonce, contract behavior or
          additional network charges.
        </p>
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
