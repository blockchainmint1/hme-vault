import { useEffect, useId, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScannerDialog } from "@/components/wallet/QrScanButton";
import { coinPasswordFromScan, combineCoinPassword, isCoinExtraRequired } from "@/lib/vault/coin-unlock";

/** Scan secrets locally; never put them in a URL, persistent store or log. */
export function CredentialInput({ value, onChange, extraWordMode = "vault", scanLabel = "Scan coin to confirm", ...props }: React.ComponentProps<typeof Input> & { extraWordMode?: "vault" | "optional" | "none"; scanLabel?: string }) {
  const [scan, setScan] = useState(false);
  const [error, setError] = useState("");
  const [base, setBase] = useState(String(value ?? ""));
  const [extra, setExtra] = useState("");
  const [required, setRequired] = useState(false);
  const [sourceExtra, setSourceExtra] = useState(false);
  const emitted = useRef(String(value ?? ""));
  const extraId = useId();
  const needsExtra = extraWordMode === "vault" ? required : extraWordMode === "optional" && sourceExtra;
  useEffect(() => { setRequired(isCoinExtraRequired()); }, []);
  useEffect(() => {
    const next = String(value ?? "");
    if (next !== emitted.current) { setBase(next); setExtra(""); emitted.current = next; }
  }, [value]);
  function update(nextBase: string, nextExtra: string, includeExtra = needsExtra) {
    setBase(nextBase); setExtra(nextExtra);
    const next = nextBase ? combineCoinPassword(nextBase, includeExtra ? nextExtra : "") : "";
    emitted.current = next;
    onChange?.({ target: { value: next } } as React.ChangeEvent<HTMLInputElement>);
  }
  return <div className="space-y-2">
    <div className="flex gap-2">
      <Input {...props} autoComplete="off" value={base} onChange={e => update(e.target.value, extra)} />
      <Button type="button" variant="outline" size="icon" disabled={props.disabled} aria-label={scanLabel} title={scanLabel} onClick={() => { setError(""); setScan(true); }}><Camera className="h-4 w-4" /></Button>
    </div>
    {extraWordMode === "optional" && <label className="flex items-center gap-2 text-sm"><Checkbox checked={sourceExtra} disabled={props.disabled} onCheckedChange={checked => { const on = checked === true; setSourceExtra(on); update(base, "", on); }} /><span>This backup uses an extra secret word</span></label>}
    {needsExtra && <div className="space-y-1"><Label htmlFor={extraId}>Extra secret word</Label><Input id={extraId} type="password" autoComplete="off" disabled={props.disabled} value={extra} onChange={e => update(base, e.target.value)} /></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {scan && <ScannerDialog hint="Scan your secret QR. Never share it." onClose={() => setScan(false)} onScan={text => {
      setScan(false);
      try {
        const words = coinPasswordFromScan(text);
        update(words, extra);
      } catch (e) { setError((e as Error).message); }
    }} />}
  </div>;
}