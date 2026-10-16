import { useEffect, useState } from "react";
import { QrCode } from "@/components/wallet/QrCode";
import { toParts } from "@/lib/signer/qr-parts";

/** One QR if it fits, otherwise cycles through numbered parts. */
export function AnimatedQr({ value, size = 280 }: { value: string; size?: number }) {
  const parts = toParts(value);
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (parts.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % parts.length), 700);
    return () => clearInterval(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-col items-center gap-1">
      <QrCode value={parts[i]} size={size} />
      {parts.length > 1 && <p className="text-xs text-muted-foreground">Part {i + 1} of {parts.length} — keep the other camera pointed until it's done</p>}
    </div>
  );
}
