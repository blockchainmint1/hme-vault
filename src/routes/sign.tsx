import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, PenLine } from "lucide-react";
import type { Psbt } from "bitcoinjs-lib";
import type { HDKey } from "@scure/bip32";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScannerDialog } from "@/components/wallet/QrScanButton";
import { AnimatedQr } from "@/components/vault/AnimatedQr";
import { Unlocked } from "@/components/vault/Unlocked";
import { useVault } from "@/lib/vault/vault-context";
import { clearSignerCache, formatCoins, parsePsbt, reviewPsbt, signPsbt, type Review } from "@/lib/signer/psbt";
import { PartCollector } from "@/lib/signer/qr-parts";

export const Route = createFileRoute("/sign")({
  head: () => ({ meta: [{ title: "Sign a payment — HME Vault" }, { name: "description", content: "Sign a TEXITcoin or IskanderCoin payment offline by QR." }, { property: "og:title", content: "Sign a payment — HME Vault" }, { property: "og:description", content: "Sign a payment offline by QR." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SignPage,
});

function SignPage() {
  const { seeds, checkPassword } = useVault();
  const [scan, setScan] = useState(false);
  const [progress, setProgress] = useState<{ have: number; total: number } | null>(null);
  const collector = useRef(new PartCollector());
  const [paste, setPaste] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ psbt: Psbt; review: Review; keys: HDKey[] } | null>(null);
  const [pw, setPw] = useState("");
  const [signed, setSigned] = useState<{ hex: string; txid: string } | null>(null);

  useEffect(() => () => clearSignerCache(), []);

  async function load(text: string) {
    setErr(""); setBusy(true);
    try {
      const psbt = parsePsbt(text);
      const { review, keys } = await reviewPsbt(psbt, seeds);
      setState({ psbt, review, keys });
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  function onCode(code: string) {
    const full = collector.current.add(code);
    setProgress(collector.current.progress.total ? collector.current.progress : null);
    if (full) {
      setScan(false);
      collector.current = new PartCollector();
      setProgress(null);
      void load(full);
    }
  }

  function reset() {
    setState(null); setSigned(null); setPw(""); setPaste(""); setErr("");
  }

  if (signed && state) {
    return (
      <Unlocked title="Signed" back>
        <Card><CardContent className="space-y-3 pt-6">
          <p className="text-sm">Scan this with your online wallet to send it. This phone never sends anything.</p>
          <AnimatedQr value={signed.hex} />
          <p className="break-all font-mono text-xs text-muted-foreground">Transaction ID: {signed.txid}</p>
          <Button variant="secondary" onClick={reset}>Done</Button>
        </CardContent></Card>
      </Unlocked>
    );
  }

  if (state) {
    const r = state.review;
    return (
      <Unlocked title="Check this payment" back>
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{r.coin} from “{r.seedName}”</CardTitle>
              <CardDescription>Compare every address with the one you meant to pay.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {r.token && (
                <div className="rounded-md border-2 border-primary p-3">
                  <p className="text-xs text-muted-foreground">Token transfer</p>
                  <p className="text-lg font-semibold">{r.token.amount} {r.token.symbol}</p>
                  {r.token.to && <p className="break-all font-mono text-sm">to {r.token.to}</p>}
                </div>
              )}
              {r.outputs.filter((o) => !o.isChange && !(r.token && o.isData)).map((o, i) => (
                <div key={i} className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">{o.isData ? "Extra data" : "Pay to"}</p>
                  <p className="break-all font-mono text-sm">{o.address}</p>
                  <p className="mt-1 text-lg font-semibold">{formatCoins(o.sats)} {r.coin}</p>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Network fee</span><span className="text-right font-medium">{formatCoins(r.feeSats)} {r.coin}</span>
                <span className="text-muted-foreground">Back to you (change)</span><span className="text-right">{formatCoins(r.changeSats)} {r.coin}</span>
                <span className="text-muted-foreground">Total leaving</span><span className="text-right font-semibold">{formatCoins(r.sendSats + r.feeSats)} {r.coin}</span>
              </div>
              {r.warnings.map((w) => (
                <p key={w} className="flex gap-2 rounded-md border border-destructive/50 p-2 text-sm"><AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />{w}</p>
              ))}
            </CardContent>
          </Card>
          <Card><CardContent className="space-y-2 pt-6">
            <form className="space-y-2" onSubmit={(e) => {
              e.preventDefault();
              if (!checkPassword(pw)) { setErr("Wrong password."); setPw(""); return; }
              try { setSigned(signPsbt(state.psbt, state.keys)); } catch (x) { setErr((x as Error).message); }
            }}>
              <Label htmlFor="spw">Vault password to sign</Label>
              <Input id="spw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
              {err && <p className="text-sm text-destructive">{err}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={reset}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={!pw}><PenLine className="h-4 w-4 mr-1.5" />Sign</Button>
              </div>
            </form>
          </CardContent></Card>
        </div>
      </Unlocked>
    );
  }

  return (
    <Unlocked title="Sign a payment" back>
      <Card><CardContent className="space-y-3 pt-6">
        <p className="text-sm">On your online wallet, make the payment as “unsigned / for offline signing”, then scan its QR here. TEXITcoin and IskanderCoin for now.</p>
        <Button className="w-full" disabled={busy || seeds.length === 0} onClick={() => { collector.current = new PartCollector(); setScan(true); }}>
          <Camera className="h-4 w-4 mr-1.5" />{busy ? "Checking…" : "Scan unsigned payment"}
        </Button>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Or paste it</summary>
          <Textarea className="mt-2" rows={4} spellCheck={false} value={paste} onChange={(e) => setPaste(e.target.value)} />
          <Button className="mt-2" variant="secondary" disabled={!paste || busy} onClick={() => load(paste)}>Check payment</Button>
        </details>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </CardContent></Card>
      {scan && (
        <ScannerDialog
          keepScanning
          hint={progress ? `Got part ${progress.have} of ${progress.total}… keep pointing.` : "Point the camera at the unsigned payment QR."}
          onClose={() => { setScan(false); setProgress(null); }}
          onScan={onCode}
        />
      )}
    </Unlocked>
  );
}
