import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, Fingerprint } from "lucide-react";
import vaultMark from "@/assets/brand/vault-mark-512.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVault } from "@/lib/vault/vault-context";
import { getBiometricStatus, unlockWithBiometric } from "@/lib/native/biometric";
import { CoinEnrollment } from "@/components/vault/CoinEnrollment";
import { ScannerDialog } from "@/components/wallet/QrScanButton";
import { coinPasswordFromScan, combineCoinPassword, isCoinExtraRequired } from "@/lib/vault/coin-unlock";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HomeBlurbs } from "@/components/vault/HomeBlurbs";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HME Vault — offline seeds and secrets" },
      { name: "description", content: "Keep recovery seeds, passwords and small files encrypted on your offline phone." },
      { property: "og:title", content: "HME Vault — offline seeds and secrets" },
      { property: "og:description", content: "Offline, password-locked storage with encrypted QR and USB backups." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Home() {
  const { status } = useVault();
  const navigate = useNavigate();
  useEffect(() => {
    if (status === "unlocked") navigate({ to: "/seeds" });
  }, [status, navigate]);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 pt-16">
      <div className="text-center">
        <img
          src={vaultMark}
          alt="HME Vault"
          width={96}
          height={96}
          className="mx-auto h-24 w-24 object-contain drop-shadow-lg"
        />
        <h1 className="mt-4 text-2xl font-semibold">HME Vault</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your seeds, locked on this device.{"\u00a0\n"}Nothing ever leaves it.</p>
      </div>
      {status === "none" && <Setup />}
      {status === "locked" && <UnlockForm />}
      <HomeBlurbs />
    </main>
  );
}

function Setup() {
  const { create } = useVault();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("password");
  async function go() {
    if (pw.length < 8) return setErr("Use at least 8 characters. A long phrase or long number is best.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    setBusy(true);
    try { await create(pw); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Tabs value={mode} onValueChange={v => { setMode(v); setPw(""); setPw2(""); setErr(""); }}>
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="password">Password</TabsTrigger><TabsTrigger value="coin">Coin QR</TabsTrigger></TabsList>
          <TabsContent value="coin"><CoinEnrollment onEnroll={create} /></TabsContent>
          <TabsContent value="password" className="space-y-3">
        <p className="text-sm">Choose a vault password. <strong>There is no reset</strong> — if you forget it, only your backups and paper copies can bring your seeds back.</p>
        <div><Label htmlFor="pw">Vault password</Label><Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div><Label htmlFor="pw2">Password again</Label><Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button className="w-full" disabled={busy} onClick={go}>{busy ? "Creating…" : "Create vault"}</Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function UnlockForm() {
  const { unlock, waitUntil } = useVault();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [bio, setBio] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [scan, setScan] = useState(false);
  const [pendingCoin, setPendingCoin] = useState("");
  const [extra, setExtra] = useState("");
  useEffect(() => { getBiometricStatus().then((s) => setBio(s.enabled)); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const wait = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  async function go(password: string) {
    setErr(""); setBusy(true);
    try { await unlock(password); } catch (e) { setErr((e as Error).message); setPw(""); } finally { setBusy(false); }
  }
  async function useBio() {
    try {
      const p = await unlockWithBiometric();
      if (p) await go(p);
    } catch (e) { setBio(false); setErr((e as Error).message); }
  }
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void go(pw); }}>
          <div><Label htmlFor="upw">Vault password</Label><Input id="upw" type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          {wait > 0 && <p className="text-sm text-muted-foreground">Too many wrong tries. Try again in {wait}s.</p>}
          <Button type="submit" className="w-full" disabled={busy || wait > 0 || !pw}>{busy ? "Unlocking…" : "Unlock"}</Button>
        </form>
        <Button variant="outline" className="w-full" disabled={busy || wait > 0} onClick={() => { setErr(""); setScan(true); }}><Camera className="mr-2 h-4 w-4" />Scan coin to unlock</Button>
        {scan && <ScannerDialog hint="Scan your coin’s QR to unlock Vault." onClose={() => setScan(false)} onScan={text => {
          setScan(false);
          try {
            const coin = coinPasswordFromScan(text);
            if (isCoinExtraRequired()) { setPendingCoin(coin); setExtra(""); }
            else void go(coin);
          } catch(e) { setErr((e as Error).message); }
        }} />}
        {pendingCoin && (
          <form className="space-y-3 rounded-md border p-3" onSubmit={(e) => { e.preventDefault(); const c = pendingCoin; setPendingCoin(""); void go(combineCoinPassword(c, extra)); }}>
            <div><Label htmlFor="coin-extra-unlock">Extra secret word</Label><Input id="coin-extra-unlock" type="password" autoFocus autoComplete="current-password" value={extra} onChange={(e) => setExtra(e.target.value)} /></div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={busy || wait > 0 || !extra.trim()}>Unlock</Button>
              <Button type="button" variant="ghost" onClick={() => { setPendingCoin(""); setExtra(""); }}>Cancel</Button>
            </div>
          </form>
        )}
        {bio && <Button variant="outline" className="w-full" onClick={useBio} disabled={wait > 0}><Fingerprint className="h-4 w-4 mr-1.5" />Use fingerprint</Button>}
      </CardContent>
    </Card>
  );
}
