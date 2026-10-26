import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowDownLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Unlocked } from "@/components/vault/Unlocked";
import { QrCode } from "@/components/wallet/QrCode";
import { useVault } from "@/lib/vault/vault-context";
import { RECEIVE_COINS, receivingAddress, type ReceiveCoin, type ReceivingAddress } from "@/lib/vault/seeds";

export const Route = createFileRoute("/receive")({
  head: () => ({ meta: [
    { title: "Receive to a seed — HME Vault" },
    { name: "description", content: "Show a seed's public receiving address QR entirely offline." },
    { property: "og:title", content: "Receive to a seed — HME Vault" },
    { property: "og:description", content: "Public receiving addresses from your offline Vault, without exposing recovery words." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ReceivePage,
});

function ReceivePage() {
  const { status } = useVault();
  return <Unlocked title="Receive" back>{status === "unlocked" && <ReceiveForm />}</Unlocked>;
}

function ReceiveForm() {
  const { seeds } = useVault();
  const [seedId, setSeedId] = useState("");
  const [coin, setCoin] = useState<ReceiveCoin>("TXC");
  const [result, setResult] = useState<{ seedId: string; coin: ReceiveCoin; value: ReceivingAddress } | null>(null);
  const [error, setError] = useState("");
  const seed = seeds.find((s) => s.id === seedId);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError("");
    if (seed) receivingAddress(seed.words, seed.passphrase ?? "", coin).then((value) => {
      if (!cancelled) setResult({ seedId: seed.id, coin, value });
    }).catch(() => { if (!cancelled) setError("Could not create this address. Please try again."); });
    return () => { cancelled = true; };
  }, [seed, coin]);
  const address = result?.seedId === seedId && result.coin === coin ? result.value : null;

  if (seeds.length === 0) return <div className="space-y-4 py-4">
    <p className="text-sm text-muted-foreground">No seeds in this vault.</p>
    <Button asChild><Link to="/seeds/new"><Plus className="mr-2 h-4 w-4" />Add a seed</Link></Button>
  </div>;

  return <div className="space-y-5 py-2">
    <div className="space-y-2">
      <Label htmlFor="receive-seed">Seed</Label>
      <Select value={seedId} onValueChange={setSeedId}>
        <SelectTrigger id="receive-seed"><SelectValue placeholder="Choose a seed" /></SelectTrigger>
        <SelectContent>{seeds.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.fingerprint}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <Label htmlFor="receive-coin">Network</Label>
      <Select value={coin} onValueChange={(value) => { const selected = RECEIVE_COINS.find((c) => c === value); if (selected) setCoin(selected); }}>
        <SelectTrigger id="receive-coin"><SelectValue /></SelectTrigger>
        <SelectContent>{RECEIVE_COINS.map((c) => <SelectItem key={c} value={c}>{c === "SOL" ? "Solana" : c === "EVM" ? "Ethereum / EVM" : c}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {seed && !address && !error && <p role="status" className="text-sm text-muted-foreground">Preparing address…</p>}
    {seed && address && <section className="space-y-3 border-t border-border pt-5">
      <h2 className="flex items-center gap-2 text-base font-semibold"><ArrowDownLeft className="h-5 w-5 text-primary" />{coin === "SOL" ? "Solana" : coin} · {seed.name}</h2>
      <div className="flex justify-center"><QrCode key={address.address} value={address.address} size={280} /></div>
      <p aria-label="Receiving address" className="break-all text-center font-mono text-sm select-text">{address.address}</p>
      <p className="text-center text-xs text-muted-foreground">Fingerprint {address.fingerprint}{seed.passphrase ? " · With seed passphrase" : ""}</p>
      <p className="break-all text-center font-mono text-xs text-muted-foreground">{address.path}</p>
      <p className="text-center text-xs text-muted-foreground">{address.format} · First receiving address</p>
      <div className="space-y-2 border-t border-border pt-3 text-sm text-muted-foreground">
        <p>Send only on the selected network. Confirm the entire address and path in your online wallet before sending.</p>
        <p>This is a fixed address, not a fresh address for each payment. Vault cannot check balances or confirm arrival while offline.</p>
      </div>
    </section>}
  </div>;
}