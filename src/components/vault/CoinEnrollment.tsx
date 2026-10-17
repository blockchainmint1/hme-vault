import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScannerDialog } from "@/components/wallet/QrScanButton";
import { coinPasswordFromScan, confirmCoinPassword } from "@/lib/vault/coin-unlock";

export function CoinEnrollment({ onEnroll, disabled = false }: { onEnroll: (password: string) => Promise<void>; disabled?: boolean }) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [ack, setAck] = useState(false);
  const [scan, setScan] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const clear = () => { if (document.visibilityState === "hidden") { setFirst(""); setSecond(""); setScan(false); } };
    document.addEventListener("visibilitychange", clear);
    return () => document.removeEventListener("visibilitychange", clear);
  }, []);
  return <div className="space-y-3">
    <p className="text-sm">Whatever the scanned QR holds (seed words, a private key or any other text) becomes your Vault password. Use a secret QR: anyone who can scan it can open Vault. This does not import the coin or connect to the coin service.</p>
    <p className="text-sm text-destructive">Anyone with a copy of the hidden QR—including a saved minting file—can open your Vault and spend the coin. Opening its seal may affect its cold-storage status.</p>
    <p className="text-sm text-muted-foreground">Keep a secure paper copy of those words and an encrypted backup with a separate backup password. There is no reset.</p>
    <label className="flex items-start gap-2 text-sm"><Checkbox checked={ack} onCheckedChange={v => setAck(v === true)} aria-label="I understand the coin unlock risks" /><span>I understand these risks and have a recovery copy.</span></label>
    <Button variant="outline" className="w-full" disabled={!ack || busy || disabled} onClick={() => { setError(""); if (second) { setFirst(""); setSecond(""); } setScan(true); }}><Camera className="mr-2 h-4 w-4" />{second ? "Start scans again" : first ? "Scan same coin again" : "Scan coin QR"}</Button>
    {first && <p className="text-sm text-muted-foreground">{second ? "Both scans match." : "First scan accepted. Scan it again to confirm."}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button className="w-full" disabled={!first || !second || !ack || busy || disabled} onClick={async () => {
      setBusy(true); setError("");
      try { const password = confirmCoinPassword(first, second, ack); setFirst(""); setSecond(""); await onEnroll(password); }
      catch(e) { setError((e as Error).message); }
      finally { setBusy(false); }
    }}>{busy ? "Saving…" : "Use coin as Vault password"}</Button>
    {scan && <ScannerDialog hint="Scan the QR you want to use as your password." onClose={() => setScan(false)} onScan={text => {
      setScan(false);
      try { const words = coinPasswordFromScan(text); if (!first) setFirst(words); else { confirmCoinPassword(first, words, ack); setSecond(words); } }
      catch(e) { setError((e as Error).message); }
    }} />}
  </div>;
}