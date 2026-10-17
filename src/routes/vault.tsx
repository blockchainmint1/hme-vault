import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { Lock, Unlock, Download, Printer, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QrCode } from "@/components/wallet/QrCode";
import { lockSeed, normalizeSeed, unlockSeed } from "@/lib/vault/format";
import { STANDALONE_UNLOCKER } from "@/lib/vault/standalone";

export const Route = createFileRoute("/vault")({
  head: () => ({
    meta: [
      { title: "Seed encryption tool — HME Vault" },
      { name: "description", content: "Lock your seed phrase with a password into a QR code or file. Open format, works offline, free to recover." },
      { property: "og:title", content: "Seed encryption tool — HME Vault" },
      { property: "og:description", content: "Password-lock your seed into a QR or file. Open, offline, free." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VaultPage,
});

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function VaultPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-8 space-y-4">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Home</Link>
      <h1 className="text-2xl font-semibold">Offline Seed Vault</h1>
      <p className="text-sm text-muted-foreground">
        Lock your recovery words with a password into a QR code or file. Without the password it's useless to
        anyone who finds it. Everything happens on this device — nothing is sent anywhere.
      </p>
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
        <WifiOff className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Best practice: turn on airplane mode before typing your words, and keep a paper or metal copy too.</span>
      </div>
      <Tabs defaultValue="lock">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="lock"><Lock className="h-4 w-4 mr-1.5" />Lock</TabsTrigger>
          <TabsTrigger value="unlock"><Unlock className="h-4 w-4 mr-1.5" />Unlock</TabsTrigger>
        </TabsList>
        <TabsContent value="lock"><LockPanel /></TabsContent>
        <TabsContent value="unlock"><UnlockPanel /></TabsContent>
      </Tabs>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recover without us</CardTitle>
          <CardDescription>
            Save this one small file next to your backup. It opens in any browser, offline, and unlocks your code
            even if this website disappears.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" onClick={() => download("seed-vault-unlocker.html", STANDALONE_UNLOCKER, "text/html")}>
            <Download className="h-4 w-4 mr-1.5" />Download offline unlocker
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function LockPanel() {
  const [seed, setSeed] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [code, setCode] = useState("");

  async function go() {
    setErr("");
    const s = normalizeSeed(seed);
    if (!validateMnemonic(s, wordlist)) return setErr("Those words aren't a valid recovery phrase. Check spelling and count.");
    if (pw.length < 8) return setErr("Use a password of at least 8 characters — longer is much safer.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    setBusy(true);
    try {
      setCode(await lockSeed(s, pw));
      setSeed(""); setPw(""); setPw2("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (code) {
    return (
      <Card className="print:shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Your locked seed</CardTitle>
          <CardDescription>Print it, or save the file. You'll need your password to open it — we can't reset it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-center"><QrCode value={code} size={260} /></div>
          <p className="break-all font-mono text-xs rounded-md border border-border p-2">{code}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
            <Button variant="secondary" onClick={() => download("seed-vault.txt", code + "\n", "text/plain")}>
              <Download className="h-4 w-4 mr-1.5" />Save file
            </Button>
            <Button variant="ghost" onClick={() => setCode("")}>Lock another</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div>
          <Label htmlFor="seed">Recovery words (12 or 24)</Label>
          <Textarea id="seed" rows={3} autoComplete="off" autoCorrect="off" spellCheck={false} value={seed} onChange={(e) => setSeed(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pw">Password</Label>
          <Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pw2">Password again</Label>
          <Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button className="w-full" disabled={busy} onClick={go}>{busy ? "Locking…" : "Lock my seed"}</Button>
      </CardContent>
    </Card>
  );
}

function UnlockPanel() {
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [words, setWords] = useState<string[] | null>(null);

  async function go() {
    setErr(""); setBusy(true);
    try {
      setWords((await unlockSeed(code, pw)).split(" "));
      setPw("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(f: File | undefined) {
    if (f) setCode((await f.text()).trim());
  }

  if (words) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {words.map((w, i) => (
              <div key={i} className="flex gap-2 rounded-md border border-border px-3 py-2 font-mono text-sm">
                <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span><span>{w}</span>
              </div>
            ))}
          </div>
          <Button variant="secondary" onClick={() => { setWords(null); setCode(""); }}>Hide words</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div>
          <Label htmlFor="code">Vault code (starts with HMVAULT1)</Label>
          <Textarea id="code" rows={4} spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
          <Input className="mt-2" type="file" accept=".txt,text/plain" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <div>
          <Label htmlFor="upw">Password</Label>
          <Input id="upw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button className="w-full" disabled={busy || !code} onClick={go}>{busy ? "Unlocking…" : "Unlock"}</Button>
      </CardContent>
    </Card>
  );
}
