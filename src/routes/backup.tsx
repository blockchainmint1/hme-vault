import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnimatedQr } from "@/components/vault/AnimatedQr";
import { TransferInput } from "@/components/vault/TransferInput";
import { Unlocked } from "@/components/vault/Unlocked";
import { useVault } from "@/lib/vault/vault-context";
import { lockText, unlockText } from "@/lib/vault/format";
import { emptyVault, mergeSeeds, parsePayload } from "@/lib/vault/seeds";
import { mergeSecrets } from "@/lib/vault/secrets";
import { saveTextFile } from "@/lib/vault/save-file";
import { STANDALONE_UNLOCKER } from "@/lib/vault/standalone";

export const Route = createFileRoute("/backup")({
  head: () => ({ meta: [{ title: "Backup — HME Vault" }, { name: "description", content: "Export or restore an encrypted backup of all your seeds and secrets." }, { property: "og:title", content: "Backup — HME Vault" }, { property: "og:description", content: "Offline encrypted backups by QR or USB." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: BackupPage,
});

function BackupPage() { return <Unlocked title="Backup" back><BackupContent /></Unlocked>; }
function BackupContent() {
  return (
    <>
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
          <Button variant="secondary" onClick={async () => { try { await saveTextFile("seed-vault-unlocker.html", STANDALONE_UNLOCKER, "text/html"); toast.success("Offline unlocker saved."); } catch(e) { toast.error((e as Error).message); } }}>
            <Download className="h-4 w-4 mr-1.5" />Save offline unlocker
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

function ExportPanel() {
  const { seeds, secrets } = useVault();
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
    try { setCode(await lockText(JSON.stringify({ ...emptyVault(), seeds, secrets }), pw)); setPw(""); setPw2(""); }
    catch(e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  if (code) {
    const fileName = `seed-vault-backup-${new Date().toISOString().slice(0, 10)}.txt`;
    return (
      <Card><CardContent className="space-y-3 pt-6">
        <p className="text-sm">Backup of {seeds.length} seeds and {secrets.length} secrets, locked with your backup password.</p>
        <AnimatedQr value={code} />
        <p className="text-xs text-muted-foreground">For large collections, saving to USB is faster. On Android, choose the plugged-in drive in the file picker.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={async () => { try { await saveTextFile(fileName, code + "\n"); toast.success("Encrypted backup saved."); } catch(e) { toast.error((e as Error).message); } }}><Download className="h-4 w-4 mr-1.5" />Save backup file / USB</Button>
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
      <Button className="w-full" disabled={busy || seeds.length + secrets.length === 0} onClick={go}>{busy ? "Locking…" : seeds.length + secrets.length === 0 ? "Nothing to back up yet" : "Make backup"}</Button>
    </CardContent></Card>
  );
}

function RestorePanel() {
  const { seeds, secrets, restore } = useVault();
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    setErr(""); setBusy(true);
    try {
      const incoming = parsePayload(await unlockText(code, pw));
      const r = mergeSeeds(seeds, incoming.seeds);
      const s = mergeSecrets(secrets, incoming.secrets);
      await restore(r.seeds, s.secrets);
      toast.success(`Restored ${r.added} seeds and ${s.added} secrets; ${r.skipped + s.skipped} duplicates skipped.`);
      setCode(""); setPw("");
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <Card><CardContent className="space-y-3 pt-6">
      <TransferInput value={code} onChange={setCode} />
      <div><Label htmlFor="rpw">Backup password</Label><Input id="rpw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button className="w-full" disabled={busy || !code || !pw} onClick={go}>{busy ? "Restoring…" : "Restore Vault"}</Button>
      <p className="text-xs text-muted-foreground">Existing seeds and identical secrets are skipped. Nothing is overwritten.</p>
    </CardContent></Card>
  );
}
