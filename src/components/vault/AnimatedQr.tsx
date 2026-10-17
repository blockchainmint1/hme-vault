import { useEffect, useState } from "react";
import { QrCode } from "@/components/wallet/QrCode";
import { toParts } from "@/lib/signer/qr-parts";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

/** One QR if it fits, otherwise cycles through numbered parts. */
export function AnimatedQr({ value, size = 280 }: { value: string; size?: number }) {
  const parts = toParts(value);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    setI(0);
  }, [value]);
  useEffect(() => {
    if (parts.length < 2 || paused) return;
    const t = setInterval(() => setI((n) => (n + 1) % parts.length), 700);
    return () => clearInterval(t);
  }, [value, paused, parts.length]);
  return (
    <div className="flex flex-col items-center gap-1">
      <QrCode value={parts[i] ?? parts[0]} size={size} />
      {parts.length > 1 && <p className="text-xs text-muted-foreground">Part {i + 1} of {parts.length} — keep the other camera pointed until it's done</p>}
      {parts.length > 1 && <div className="flex gap-2"><Button variant="outline" size="icon" aria-label="Previous QR part" title="Previous QR part" onClick={() => { setPaused(true); setI(n => (n - 1 + parts.length) % parts.length); }}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label={paused ? "Play QR transfer" : "Pause QR transfer"} title={paused ? "Play QR transfer" : "Pause QR transfer"} onClick={() => setPaused(p => !p)}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</Button><Button variant="outline" size="icon" aria-label="Next QR part" title="Next QR part" onClick={() => { setPaused(true); setI(n => (n + 1) % parts.length); }}><ChevronRight className="h-4 w-4" /></Button></div>}
    </div>
  );
}
