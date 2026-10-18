import { useEffect, useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScannerDialog } from "@/components/wallet/QrScanButton";
import { PartCollector } from "@/lib/signer/qr-parts";
import { openBackupFile } from "@/lib/vault/save-file";
import { useVault } from "@/lib/vault/vault-context";

export function TransferInput({ value, onChange, qrOnly = false }: { value: string; onChange: (text: string) => void; qrOnly?: boolean }) {
  const { pendingCode, setPendingCode } = useVault();
  // Keep ciphertext in the provider until import succeeds or the owner discards it.
  // A second background lock must not lose a file already handed to this panel.
  useEffect(() => { if (pendingCode && pendingCode !== value) onChange(pendingCode); }, [pendingCode, value, onChange]);
  const [scan, setScan] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");
  const collector = useRef(new PartCollector());
  return <div className="space-y-2">
    {!qrOnly && <><Label htmlFor="transfer-code">Encrypted code (HMVAULT1)</Label>
    <Textarea id="transfer-code" rows={3} value={value} spellCheck={false} onChange={e => onChange(e.target.value)} /></>}
    {qrOnly && value && <p role="status" className="text-sm text-muted-foreground">Encrypted backup received. Ready to import.</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => { collector.current = new PartCollector(); setErr(""); setProgress(""); setScan(true); }}><Camera className="mr-1.5 h-4 w-4" />Scan transfer QR</Button>
      <Button variant="outline" onClick={async () => { try { const text = await openBackupFile(); if (text !== null) { if (!text.trim().startsWith("HMVAULT1.")) throw new Error("Choose an encrypted HMVAULT1 backup."); setPendingCode(text.trim()); } } catch(e) { setErr((e as Error).message); } }}><Upload className="mr-1.5 h-4 w-4" />Open backup file</Button>
    </div>
    {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    {scan && <ScannerDialog keepScanning hint={progress || "Point at the encrypted QR. Keep scanning until all parts arrive."} onClose={() => setScan(false)} onScan={code => {
      try { const full = collector.current.add(code); const p = collector.current.progress; setProgress(`${p.have} of ${p.total} parts received`); if (full) { setScan(false); setPendingCode(full); onChange(full); } }
      catch(e) { setScan(false); setErr((e as Error).message); }
    }} />}
  </div>;
}