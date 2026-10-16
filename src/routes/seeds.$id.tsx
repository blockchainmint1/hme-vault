import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrCode } from "@/components/wallet/QrCode";
import { Unlocked } from "@/components/vault/Unlocked";
import { useVault } from "@/lib/vault/vault-context";
import { deriveKeys, REVEAL_HIDE_MS, TXC_ACCOUNT_PATH, EVM_PATH, type SeedKeys } from "@/lib/vault/seeds";

export const Route = createFileRoute("/seeds/$id")({
  head: () => ({ meta: [{ title: "Seed — HME Seed Vault" }, { name: "description", content: "View a stored seed." }, { property: "og:title", content: "Seed — HME Seed Vault" }, { property: "og:description", content: "View a stored seed." }] }),
  component: SeedPage,
});

function SeedPage() {
  const { id } = Route.useParams();
  const { seeds, save, checkPassword } = useVault();
  const navigate = useNavigate();
  const seed = seeds.find((s) => s.id === id);
  const [reveal, setReveal] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [keys, setKeys] = useState<SeedKeys | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [del, setDel] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delName, setDelName] = useState("");
  const [name, setName] = useState(seed?.name ?? "");

  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => setReveal(false), REVEAL_HIDE_MS);
    return () => clearTimeout(t);
  }, [reveal]);

  if (!seed) return <Unlocked title="Seed" back><p className="text-sm text-muted-foreground">That seed isn't in your vault.</p></Unlocked>;

  const words = seed.words.split(" ");

  return (
    <Unlocked title={seed.name} back>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recovery words</CardTitle>
            <CardDescription>Fingerprint <span className="font-mono">{seed.fingerprint}</span> · {words.length} words{seed.passphrase ? " · has passphrase" : ""}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!reveal ? (
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (checkPassword(pw)) { setReveal(true); setErr(""); } else setErr("Wrong password."); setPw(""); }}>
                <Label htmlFor="rpw">Type your vault password to show the words and QR</Label>
                <Input id="rpw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
                {err && <p className="text-sm text-destructive">{err}</p>}
                <Button type="submit" disabled={!pw}><Eye className="h-4 w-4 mr-1.5" />Show seed</Button>
              </form>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {words.map((w, i) => <div key={i} className="flex gap-2 rounded-md border border-border px-3 py-2 font-mono text-sm"><span className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>{w}</div>)}
                </div>
                {seed.passphrase && <p className="text-sm">Passphrase: <span className="font-mono">{seed.passphrase}</span></p>}
                <div className="flex flex-col items-center gap-1">
                  <QrCode value={seed.words} size={260} />
                  <p className="text-xs text-muted-foreground">Seed QR{seed.passphrase ? " (words only, passphrase not included)" : ""}. Hides in 60 seconds.</p>
                </div>
                <Button variant="secondary" onClick={() => setReveal(false)}>Hide now</Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Watch-only keys</CardTitle>
            <CardDescription>Safe to share. Lets an online wallet see balances, but never spend.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!showKeys ? (
              <Button variant="outline" onClick={async () => { setShowKeys(true); setKeys(await deriveKeys(seed.words, seed.passphrase)); }}>Show watch-only QR</Button>
            ) : !keys ? <p className="text-sm text-muted-foreground">Working…</p> : (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm font-medium">TEXITcoin watch key</p>
                  <QrCode value={keys.txcXpub} size={220} />
                  <p className="break-all font-mono text-xs">{keys.txcXpub}</p>
                  <p className="text-xs text-muted-foreground">{TXC_ACCOUNT_PATH}</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm font-medium">Ethereum / EVM address</p>
                  <QrCode value={keys.evmAddress} size={220} />
                  <p className="break-all font-mono text-xs">{keys.evmAddress}</p>
                  <p className="text-xs text-muted-foreground">{EVM_PATH}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex gap-2">
              <Input aria-label="Seed name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="secondary" disabled={!name.trim() || name === seed.name} onClick={() => save(seeds.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)))}>Rename</Button>
            </div>
            {!del ? (
              <Button variant="ghost" className="text-destructive" onClick={() => setDel(true)}><Trash2 className="h-4 w-4 mr-1.5" />Delete this seed</Button>
            ) : (
              <div className="space-y-2 rounded-md border border-destructive/50 p-3">
                <p className="text-sm">This removes the seed from this phone. Make sure you have it on paper or in a backup.</p>
                <Input placeholder="Vault password" type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
                <Input placeholder={`Type "${seed.name}" to confirm`} value={delName} onChange={(e) => setDelName(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setDel(false)}>Cancel</Button>
                  <Button variant="destructive" disabled={delName !== seed.name || !checkPassword(delPw)} onClick={async () => { await save(seeds.filter((s) => s.id !== id)); navigate({ to: "/seeds" }); }}>Delete</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Unlocked>
  );
}
