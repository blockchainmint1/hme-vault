import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Eye, FileKey, KeyRound, Plus, ScanLine, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Unlocked } from "@/components/vault/Unlocked";
import { TransferInput } from "@/components/vault/TransferInput";
import { AnimatedQr } from "@/components/vault/AnimatedQr";
import { useVault } from "@/lib/vault/vault-context";
import { emptyVault, mergeSeeds, parsePayload, REVEAL_HIDE_MS } from "@/lib/vault/seeds";
import { mergeSecrets, validateSecret, type SecretEntry } from "@/lib/vault/secrets";
import { lockText, unlockText } from "@/lib/vault/format";
import { saveBinaryFile, saveTextFile } from "@/lib/vault/save-file";
import { OFFLINE_TRANSFER_PAGE } from "@/lib/vault/transfer-page";

export const Route = createFileRoute("/secrets")({
  head: () => ({ meta: [{ title: "Secrets — HME Vault" }, { name: "description", content: "Offline encrypted storage for passwords, secure notes and small files." }, { property: "og:title", content: "Secrets — HME Vault" }, { property: "og:description", content: "Keep passwords, notes and keystores in your offline Vault." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SecretsPage,
});
function SecretsPage() { return <Unlocked title="Secrets" back><SecretsContent /></Unlocked>; }

function SecretsContent() {
  const { seeds, secrets, saveSecrets, restore, checkPassword } = useVault();
  const [mode, setMode] = useState("list");
  const [name, setName] = useState(""); const [type, setType] = useState<"password" | "note">("password"); const [content, setContent] = useState("");
  const [code, setCode] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<SecretEntry | null>(null); const [revealed, setRevealed] = useState(false); const [confirmation, setConfirmation] = useState("");
  const [exportCode, setExportCode] = useState(""); const [pw2, setPw2] = useState("");
  useEffect(() => { if (!revealed) return; const t = setTimeout(() => { setRevealed(false); setExportCode(""); setPw(""); }, REVEAL_HIDE_MS); return () => clearTimeout(t); }, [revealed]);
  function reset() { setMode("list"); setSelected(null); setRevealed(false); setExportCode(""); setPw(""); setPw2(""); setConfirmation(""); setErr(""); setContent(""); setCode(""); setName(""); }
  async function run(action: () => Promise<void>) { setBusy(true); setErr(""); try { await action(); } catch(e) { setErr((e as Error).message); } finally { setBusy(false); } }
  const error = err && <p role="alert" className="text-sm text-destructive">{err}</p>;

  if (selected) return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><h2 className="break-words font-medium">{selected.name}</h2><Button variant="ghost" size="icon" aria-label="Close secret" onClick={reset}><X className="h-4 w-4" /></Button></div>
    <p className="text-xs text-muted-foreground">{selected.type === "file" ? selected.filename : selected.type === "password" ? "Password" : "Secure note"}</p>
    {!revealed ? <div className="space-y-3"><Label htmlFor="secret-pw">Vault password</Label><Input id="secret-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} /><Button onClick={() => { if (!checkPassword(pw)) { setPw(""); setErr("Wrong password."); return; } setPw(""); setErr(""); setRevealed(true); }}><Eye className="mr-1.5 h-4 w-4" />Open secret</Button></div> : <div className="space-y-3">
      {selected.type !== "file" && <pre className="whitespace-pre-wrap break-all rounded-md border border-border p-4 text-sm">{selected.content}</pre>}
      <Button variant="outline" onClick={() => void run(async () => { if (selected.type === "file") await saveBinaryFile(selected.filename ?? "secret.bin", selected.content); else await saveTextFile("secret.txt", selected.content); toast.success("Secret exported. This file is NOT encrypted."); })}><Download className="mr-1.5 h-4 w-4" />Export unencrypted {selected.type === "file" ? "file" : "text"}</Button>
      <p className="text-xs text-destructive">An exported secret is readable without a password. Prefer an encrypted backup.</p>
      <div className="border-t border-border pt-4 space-y-2"><Label htmlFor="export-pw">Encrypted transfer password</Label><Input id="export-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} /><Label htmlFor="export-pw2">Transfer password again</Label><Input id="export-pw2" type="password" value={pw2} onChange={e => setPw2(e.target.value)} /><Button disabled={busy} onClick={() => void run(async () => { if (pw !== pw2) throw new Error("Passwords don't match."); setExportCode(await lockText(JSON.stringify({ ...emptyVault(), secrets: [selected] }), pw)); setPw(""); setPw2(""); })}><ScanLine className="mr-1.5 h-4 w-4" />Make encrypted transfer QR</Button>{exportCode && <AnimatedQr value={exportCode} />}</div>
      <Button variant="ghost" onClick={() => { setRevealed(false); setExportCode(""); setPw(""); setPw2(""); }}>Hide secret</Button>
    </div>}
    <div className="border-t border-border pt-4 space-y-2"><Label htmlFor="delete-pw">Vault password to delete</Label><Input id="delete-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} /><Input aria-label="Delete confirmation" placeholder='Type DELETE to confirm' value={confirmation} onChange={e => setConfirmation(e.target.value)} /><Button variant="destructive" disabled={busy || confirmation !== "DELETE" || !checkPassword(pw)} onClick={() => void run(async () => { await saveSecrets(secrets.filter(s => s.id !== selected.id)); reset(); toast.success("Secret deleted."); })}><Trash2 className="mr-1.5 h-4 w-4" />Delete secret</Button></div>{error}
  </div>;

  return <div className="space-y-4">
    <Tabs value={mode} onValueChange={v => { reset(); setMode(v); }}><TabsList className="grid w-full grid-cols-3"><TabsTrigger value="list">My secrets</TabsTrigger><TabsTrigger value="add">Add</TabsTrigger><TabsTrigger value="import">Import</TabsTrigger></TabsList>
      <TabsContent value="list" className="space-y-2">{secrets.length === 0 && <p className="py-6 text-sm text-muted-foreground">No secrets saved yet.</p>}{secrets.map(s => <Button key={s.id} variant="outline" className="h-auto w-full justify-start gap-3 py-4" onClick={() => { reset(); setSelected(s); }}>{s.type === "file" ? <FileKey className="h-5 w-5 shrink-0" /> : s.type === "note" ? <StickyNote className="h-5 w-5 shrink-0" /> : <KeyRound className="h-5 w-5 shrink-0" />}<span className="min-w-0 text-left"><span className="block truncate">{s.name}</span><span className="block truncate text-xs text-muted-foreground">{s.type === "file" ? s.filename : s.type === "note" ? "Secure note" : "Password"}</span></span></Button>)}</TabsContent>
      <TabsContent value="add" className="space-y-3"><Tabs value={type} onValueChange={v => setType(v === "note" ? "note" : "password")}><TabsList><TabsTrigger value="password">Password</TabsTrigger><TabsTrigger value="note">Secure note</TabsTrigger></TabsList></Tabs><Label htmlFor="secret-name">Name</Label><Input id="secret-name" maxLength={200} value={name} onChange={e => setName(e.target.value)} /><Label htmlFor="secret-content">{type === "password" ? "Password" : "Note"}</Label>{type === "password" ? <Input id="secret-content" type="password" value={content} onChange={e => setContent(e.target.value)} autoComplete="off" /> : <Textarea id="secret-content" rows={6} value={content} onChange={e => setContent(e.target.value)} spellCheck={false} />}<Button disabled={busy || !name.trim() || !content} onClick={() => void run(async () => { const s = validateSecret({ id: crypto.randomUUID(), name, type, content, createdAt: Date.now() }); await saveSecrets([...secrets, s]); reset(); toast.success("Secret saved."); })}><Plus className="mr-1.5 h-4 w-4" />Save secret</Button></TabsContent>
      <TabsContent value="import" className="space-y-3"><TransferInput value={code} onChange={setCode} /><Label htmlFor="import-pw">Transfer or backup password</Label><Input id="import-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} /><Button disabled={busy || !code || !pw} onClick={() => void run(async () => { const incoming = parsePayload(await unlockText(code, pw)); const a = mergeSeeds(seeds, incoming.seeds); const b = mergeSecrets(secrets, incoming.secrets); await restore(a.seeds, b.secrets); reset(); toast.success(`Imported ${b.added} secrets and ${a.added} seeds; ${a.skipped + b.skipped} duplicates skipped.`); })}>{busy ? "Importing…" : "Import into Vault"}</Button><div className="border-t border-border pt-4"><Button variant="secondary" onClick={() => void run(async () => { await saveTextFile("vault-transfer.html", OFFLINE_TRANSFER_PAGE, "text/html"); toast.success("Offline transfer page saved."); })}><Download className="mr-1.5 h-4 w-4" />Save computer transfer page</Button><p className="mt-2 text-xs text-muted-foreground">Small files up to 256 KB. Large QR transfers can take several minutes.</p></div></TabsContent>
    </Tabs>{error}
  </div>;
}