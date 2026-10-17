import { useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScannerDialog } from "@/components/wallet/QrScanButton";
import { coinPasswordFromScan } from "@/lib/vault/coin-unlock";

/** Scan secrets locally; never put them in a URL, persistent store or log. */
export function CredentialInput({ value, onChange, ...props }: React.ComponentProps<typeof Input>) {
  const [scan, setScan] = useState(false);
  const [error, setError] = useState("");
  return <div className="space-y-2">
    <div className="flex gap-2">
      <Input {...props} value={value} onChange={onChange} />
      <Button type="button" variant="outline" size="icon" disabled={props.disabled} aria-label="Scan coin to confirm" title="Scan hidden coin seed QR" onClick={() => { setError(""); setScan(true); }}><Camera className="h-4 w-4" /></Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {scan && <ScannerDialog hint="Scan the coin’s hidden seed QR. Never share it." onClose={() => setScan(false)} onScan={text => {
      setScan(false);
      try {
        const words = coinPasswordFromScan(text);
        onChange?.({ target: { value: words } } as React.ChangeEvent<HTMLInputElement>);
      } catch (e) { setError((e as Error).message); }
    }} />}
  </div>;
}