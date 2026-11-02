import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ThorSwapReview } from "@/lib/signer/thor-evm";

/** Review screen for a THORChain swap prepared on an EVM chain. */
export function ThorSwapPaymentReview({ review: r }: { review: ThorSwapReview }) {
  const q = r.request;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          THORChain swap on {r.chainName} from “{r.seedName}”
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-lg font-semibold">{r.actionLabel}</p>
        <div className="rounded-md border-2 border-primary p-3 space-y-1">
          <p className="text-xs text-muted-foreground">
            THORChain deposit address. Compare with the address shown in Honest Money before
            signing.
          </p>
          <p className="break-all font-mono text-sm">{r.depositAddress}</p>
        </div>
        <div className="rounded-md border border-border p-3 space-y-1">
          <p className="text-xs text-muted-foreground">You will receive {r.payoutLabel} at</p>
          <p className="break-all font-mono text-sm">{r.destination}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Router contract</p>
          <p className="break-all font-mono text-sm">{q.quote.router}</p>
        </div>
        {q.quote.from.startsWith("0x") && (
          <div>
            <p className="text-xs text-muted-foreground">Token contract</p>
            <p className="break-all font-mono text-sm">{q.quote.from}</p>
          </div>
        )}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Action</dt>
          <dd className="text-right break-all">{q.action}</dd>
          <dt className="text-muted-foreground">Chain ID</dt>
          <dd className="text-right">{q.transaction.chainId}</dd>
          <dt className="text-muted-foreground">Nonce</dt>
          <dd className="text-right">{q.transaction.nonce}</dd>
          <dt className="text-muted-foreground">Gas limit</dt>
          <dd className="text-right">{q.transaction.gas}</dd>
          <dt className="text-muted-foreground">Fee per gas (base units)</dt>
          <dd className="text-right break-all">
            {q.transaction.gasPrice ?? q.transaction.maxFeePerGas}
          </dd>
          <dt className="text-muted-foreground">Quote expires (UTC)</dt>
          <dd className="text-right break-all">{r.expiryLabel}</dd>
          <dt className="text-muted-foreground">Maximum network fee</dt>
          <dd className="text-right break-all font-medium">{r.feeLabel}</dd>
        </dl>
        <p className="text-xs text-muted-foreground break-all">
          {q.path} · {q.transaction.type}
        </p>
        <p className="text-sm text-muted-foreground">
          This offline phone cannot check pool state, balances or whether the swap succeeds. A
          failed swap returns your coins to the sending address.
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
