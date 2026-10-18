import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Fingerprint, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnimatedQr } from "@/components/vault/AnimatedQr";
import { CredentialInput } from "@/components/vault/CredentialInput";
import { TransferInput } from "@/components/vault/TransferInput";
import { Unlocked } from "@/components/vault/Unlocked";
import { useVault } from "@/lib/vault/vault-context";
import { getBiometricStatus, unlockWithBiometric } from "@/lib/native/biometric";
import { saveTextFile } from "@/lib/vault/save-file";
import { STANDALONE_UNLOCKER } from "@/lib/vault/standalone";

export const Route = createFileRoute("/backup")({
  head: () => ({ meta: [{ title: "Backup & device copy — HME Vault" }, { name: "description", content: "Back up your Vault with its existing key or copy seeds, secrets and authenticator accounts offline by QR." }, { property: "og:title", content: "Backup & device copy — HME Vault" }, { property: "og:description", content: "Same-key encrypted backups and offline device copying by QR or USB." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: BackupPage,
});

function BackupPage() {
  return <Unlocked title="Backup" back><BackupContent /></Unlocked>;
}

function BackupContent() {
  const { pendingCode } = useVault();
  const [tab, setTab] = useState(pendingCode ? "receive" : "file");
  useEffect(() => { if (pendingCode) setTab("receive"); }, [pendingCode]);
  return <div className="space-y-6">
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="file">Save file / USB</TabsTrigger>
        <TabsTrigger value="send">Send QR</TabsTrigger>
        <TabsTrigger value="receive">Receive</TabsTrigger>
      </TabsList>
      <TabsContent value="file"><ExportPanel mode="file" /></TabsContent>
      <TabsContent value="send"><ExportPanel mode="send" /></TabsContent>
      <TabsContent value="receive"><ReceivePanel /></TabsContent>
    </Tabs>
    <section className="space-y-2 border-t border-border pt-4">
      <h2 className="text-base font-semibold">Recover without this app</h2>
      <p className="text-sm text-muted-foreground">Keep this offline recovery page next to your encrypted backup. Recovery needs the secret QR or password and any extra secret word used when the backup was made—not a fingerprint.</p>
      <Button variant="secondary" onClick={async () => { try { await saveTextFile("seed-vault-unlocker.html", STANDALONE_UNLOCKER, "text/html"); toast.success("Offline unlocker saved."); } catch(e) { toast.error((e as Error).message); } }}>
        <Download className="mr-1.5 h-4 w-4" />Save offline unlocker
      </Button>
    </section>
  </div>;
}

function ExportPanel({ mode }: { mode: "file" | "send" }) {
  const { seeds, secrets, exportBackup } = useVault();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function go() {
    setErr(""); setBusy(true);
    try {
      const encrypted = await exportBackup();
      if (!alive.current) return;
      if (mode === "send") setCode(encrypted);
      else {
        await saveTextFile(`seed-vault-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`, encrypted + "\n");
        toast.success("Encrypted backup saved.");
      }
    } catch(e) { if (alive.current) setErr((e as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  const accounts = secrets.filter(s => s.type === "totp").length;
  return <section className="space-y-4 py-4">
    <h2 className="text-lg font-semibold">{mode === "send" ? "Copy to another Vault" : "Save an encrypted backup"}</h2>
    <p className="text-sm">{seeds.length} seeds · {secrets.length - accounts} secrets · {accounts} authenticator accounts</p>
    <p className="text-sm text-muted-foreground">Encrypted with your current Vault key, including your extra secret word if set. No separate backup password. Keep both safe and separate from the backup. Changing your Vault key does not change older backups.</p>
    {code ? <>
      <AnimatedQr value={code} />
      <Button variant="secondary" onClick={() => setCode("")}>Done</Button>
    </> : <Button className="w-full" disabled={busy || seeds.length + secrets.length === 0} onClick={go}>
      {mode === "send" ? <QrCode className="mr-1.5 h-4 w-4" /> : <Download className="mr-1.5 h-4 w-4" />}
      {busy ? "Encrypting…" : seeds.length + secrets.length === 0 ? "Nothing to back up yet" : mode === "send" ? "Show encrypted QRs" : "Save backup file / USB"}
    </Button>}
    {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
  </section>;
}

function ReceivePanel() {
  const { importBackup, checkPassword, setPendingCode } = useVault();
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [otherKey, setOtherKey] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [bio, setBio] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    getBiometricStatus().then(s => { if (alive.current) setBio(s.enabled); });
    return () => { alive.current = false; };
  }, []);
  async function go(fingerprint = false) {
    setErr(""); setBusy(true);
    try {
      if (fingerprint) {
        const credential = await unlockWithBiometric();
        if (!alive.current || credential === null) return;
        if (!checkPassword(credential)) throw new Error("Fingerprint does not match this Vault. Unlock with your secret QR or password.");
      }
      const r = await importBackup(code, otherKey ? pw : undefined);
      setPendingCode("");
      if (!alive.current) return;
      setResult(`Added ${r.addedSeeds} seeds and ${r.addedSecrets} secrets / authenticator accounts; ${r.skipped} duplicates skipped.`);
      setCode(""); setPw(""); setOtherKey(false);
    } catch(e) { if (alive.current) setErr((e as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="space-y-4 py-4">
    <h2 className="text-lg font-semibold">Receive a backup or device copy</h2>
    <TransferInput qrOnly value={code} onChange={text => { setCode(text); setErr(""); setResult(""); }} />
    {code && <>
      {otherKey ? <div className="space-y-2">
        <Label htmlFor="source-key">Sending Vault’s secret QR or backup password</Label>
        <CredentialInput extraWordMode="optional" id="source-key" type="password" autoComplete="off" value={pw} disabled={busy} onChange={e => setPw(e.target.value)} />
        <Button variant="ghost" disabled={busy} onClick={() => { setOtherKey(false); setPw(""); setErr(""); }}>Use this Vault’s key instead</Button>
      </div> : <Button variant="outline" disabled={busy} onClick={() => { setOtherKey(true); setErr(""); }}>Different key or older backup?</Button>}
      {bio && <Button className="w-full" disabled={busy || (otherKey && !pw)} onClick={() => go(true)}><Fingerprint className="mr-1.5 h-4 w-4" />Approve with fingerprint</Button>}
      <Button className="w-full" variant={bio ? "secondary" : "default"} disabled={busy || (otherKey && !pw)} onClick={() => go()}>{busy ? "Importing…" : "Import into this Vault"}</Button>
      <Button variant="ghost" disabled={busy} onClick={() => { setPendingCode(""); setCode(""); setPw(""); setOtherKey(false); setErr(""); }}>Discard selected backup</Button>
    </>}
    {err && <p role="alert" className="text-sm text-destructive">{err} If the backup uses another key, select “Different key or older backup?”.</p>}
    {result && <p role="status" className="text-sm">{result}</p>}
    <p className="text-sm text-muted-foreground">Adds missing entries without deleting or replacing anything here. This device keeps its own unlock key and fingerprint. Repeat after adding entries on your other phone.</p>
  </section>;
}
