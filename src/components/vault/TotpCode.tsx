import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseOtpAuth, secondsRemaining, totpCode, type TotpParams } from "@/lib/vault/totp";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";

/** Live 6/8-digit authenticator code with countdown. Runs fully offline from the phone clock. */
export function TotpCode({ uri }: { uri: string }) {
  const [params, setParams] = useState<TotpParams | null>(null);
  const [code, setCode] = useState("");
  const [left, setLeft] = useState(0);
  const { copied, copy } = useCopyFeedback();

  useEffect(() => {
    let p: TotpParams;
    try {
      p = parseOtpAuth(uri);
    } catch {
      setParams(null);
      return;
    }
    setParams(p);
    let alive = true;
    const tick = async () => {
      const now = Date.now();
      const c = await totpCode(p, now);
      if (!alive) return;
      setCode(c);
      setLeft(secondsRemaining(p, now));
    };
    void tick();
    const t = setInterval(() => void tick(), 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [uri]);

  if (!params)
    return <p className="text-sm text-destructive">This authenticator entry is invalid.</p>;

  return (
    <div className="space-y-3 rounded-md border border-border p-4 text-center">
      {params.issuer && <p className="text-xs text-muted-foreground">{params.issuer}</p>}
      <p className="font-mono text-4xl tracking-[0.2em]" aria-live="polite">
        {code.slice(0, code.length / 2)} {code.slice(code.length / 2)}
      </p>
      <div className="mx-auto h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${(left / params.period) * 100}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">New code in {left}s</p>
      <Button variant="outline" size="sm" onClick={() => void copy(code)}>
        <Copy className="mr-1.5 h-4 w-4" />
        {copied ? "Copied" : "Copy code"}
      </Button>
    </div>
  );
}
