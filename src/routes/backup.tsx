import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QrCode } from "@/components/wallet/QrCode";
import { QrScanButton } from "@/components/wallet/QrScanButton";
import { Unlocked } from "@/components/vault/Unlocked";
import { useVault } from "@/lib/vault/vault-context";
import { lockText, unlockText } from "@/lib/vault/format";
import { emptyVault, mergeSeeds, parsePayload } from "@/lib/vault/seeds";
import { saveTextFile } from "@/lib/vault/save-file";
import { STANDALONE_UNLOCKER } from "@/lib/vault/standalone";

/** A QR at medium error correction reliably holds about this many characters. */
const QR_MAX = 2000;

export const Route = createFileRoute("/backup")({
  head: () => ({ meta: [{ title: "Backup — HME Seed Vault" }, { name: "description", content: "Export or restore an encrypted backup of your vault." }, { property: "og:title", content: "Backup — HME Seed Vault" }, { property: "og:description", content: "Export or restore an encrypted backup of your vault." }] }),
  component: BackupPage,
});

function BackupPage() {
  return (
    <Unlocked title="Backup" back>
      <Tabs defaultValue="export">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="export">Make a backup</TabsTrigger>
          <TabsTrigger value="restore">Restore</TabsTrigger>
        </TabsList>
        <TabsContent value="export"><ExportPanel /></TabsContent>
        <TabsContent value="restore"><RestorePanel /></TabsContent>
      </Tabs>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Recover without this app</CardTitle>
          <CardDescription>Keep this small page next to your backup. It opens backups in any browser, offline.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" onClick={async () => toast.success(`Saved to ${await saveTextFile("seed-vault-unlocker.html", STANDALONE_UNLOCKER, "text/html")}`)}>
            <Download className="h-4 w-4 mr-1.5" />Save offline unlocker
          </Button>
        </CardContent>
      </Card>
    </Unlocked>
  );
}

function ExportPanel() {
  const { seeds } = useVault();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");

  async function go() {
    setErr("");
    if (pw.length < 8) return setErr("Backup password must be at least 8 characters.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    setBusy(true);
    try { setCode(await lockText(JSON.stringify({ ...emptyVault(), seeds }), pw)); setPw(""); setPw2(""); }
    finally { setBusy(false); }
  }

  if (code) {
    const fileName = `seed-vault-backup-${new Date().toISOString().slice(0, 10)}.txt`;
    return (
      <Card><CardContent className="space-y-3 pt-6">
        <p className="text-sm">Backup of {seeds.length} seed{seeds.length === 1 ? "" : "s"}, locked with your backup password.</p>
        {code.length <= QR_MAX ? (
          <div className="flex flex-col items-center gap-1">
            <QrCode value={code} size={300} />
            <p className="text-xs text-muted-foreground">Scan this with another Seed Vault, or photograph/print it.</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Too many seeds to fit in one QR code — save the file instead.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={async () => toast.success(`Saved to ${await saveTextFile(fileName, code + "\n")}`)}><Download className="h-4 w-4 mr-1.5" />Save backup file</Button>
          <Button variant="ghost" onClick={() => setCode("")}>Done</Button>
        </div>
      </CardContent></Card>
    );
  }

  return (
    <Card><CardContent className="space-y-3 pt-6">
      <p className="text-sm">Pick a backup password. It can differ from your vault password — don't lose it, there's no reset.</p>
      <div><Label htmlFor="bpw">Backup password</Label><Input id="bpw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      <div><Label htmlFor="bpw2">Password again</Label><Input id="bpw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button className="w-full" disabled={busy || seeds.length === 0} onClick={go}>{busy ? "Locking…" : seeds.length === 0 ? "No seeds to back up yet" : "Make backup"}</Button>
    </CardContent></Card>
  );
}

function RestorePanel() {
  const { seeds, save } = useVault();
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    setErr(""); setBusy(true);
    try {
      const incoming = parsePayload(await unlockText(code, pw)).seeds;
      const r = mergeSeeds(seeds, incoming);
      await save(r.seeds);
      toast.success(`Restored ${r.added} seed${r.added === 1 ? "" : "s"}${r.skipped ? `, ${r.skipped} already here` : ""}.`);
      setCode(""); setPw("");
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <Card><CardContent className="space-y-3 pt-6">
      <div>
        <Label htmlFor="rc">Backup code (starts with HMVAULT1)</Label>
        <div className="flex gap-2">
          <Textarea id="rc" rows={3} spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
          <QrScanButton onScan={setCode} />
        </div>
        <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <Upload className="h-4 w-4" />Open a backup file
          <input type="file" accept=".txt,text/plain" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCode((await f.text()).trim()); }} />
        </label>
      </div>
      <div><Label htmlFor="rpw">Backup password</Label><Input id="rpw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button className="w-full" disabled={busy || !code || !pw} onClick={go}>{busy ? "Restoring…" : "Restore seeds"}</Button>
      <p className="text-xs text-muted-foreground">Seeds already in your vault are skipped, nothing is overwritten.</p>
    </CardContent></Card>
  );
}
