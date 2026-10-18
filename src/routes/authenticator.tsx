import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, Eye, Fingerprint, Plus, Timer, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CredentialInput } from "@/components/vault/CredentialInput";
import { ScannerDialog } from "@/components/wallet/QrScanButton";
import { TotpCode } from "@/components/vault/TotpCode";
import { Unlocked } from "@/components/vault/Unlocked";
import { VaultTabs } from "@/components/vault/VaultTabs";
import { useVault } from "@/lib/vault/vault-context";
import { REVEAL_HIDE_MS } from "@/lib/vault/seeds";
import { validateSecret, type SecretEntry } from "@/lib/vault/secrets";
import { parseOtpAuth } from "@/lib/vault/totp";
import { confirmWithBiometric, getBiometricStatus } from "@/lib/native/biometric";

export const Route = createFileRoute("/authenticator")({
  head: () => ({ meta: [{ title: "Authenticator — HME Vault" }, { name: "description", content: "Offline two-factor codes generated on this device." }, { property: "og:title", content: "Authenticator — HME Vault" }, { property: "og:description", content: "6-digit 2FA codes made offline, inside your encrypted Vault." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AuthenticatorPage,
});

function AuthenticatorPage() {
  const { secrets, saveSecrets, checkPassword } = useVault();
  const accounts = secrets.filter(s => s.type === "totp");
  const [selected, setSelected] = useState<SecretEntry | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [pw, setPw] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [bio, setBio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [scan, setScan] = useState(false);

  useEffect(() => { getBiometricStatus().then(s => setBio(s.enabled)); }, []);
  useEffect(() => { if (!revealed) return; const t = setTimeout(() => { setRevealed(false); setPw(""); }, REVEAL_HIDE_MS); return () => clearTimeout(t); }, [revealed]);

  async function run(action: () => Promise<void>) { setBusy(true); setErr(""); try { await action(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }
  function close() { setSelected(null); setRevealed(false); setPw(""); setConfirmation(""); setErr(""); }
  const error = err && <p role="alert" className="text-sm text-destructive">{err}</p>;

  return (
    <Unlocked title="Authenticator" back>
      <VaultTabs />
      {selected ? <div className="space-y-4">
        <div className="flex items-center justify-between gap-3"><h2 className="break-words font-medium">{selected.name}</h2><Button variant="ghost" size="icon" aria-label="Close account" onClick={close}><X className="h-4 w-4" /></Button></div>
        {!revealed ? <div className="space-y-3">
          <Label htmlFor="totp-pw">Vault password</Label>
          <CredentialInput id="totp-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} />
          <Button onClick={() => { if (!checkPassword(pw)) { setPw(""); setErr("Wrong password."); return; } setPw(""); setErr(""); setRevealed(true); }}><Eye className="mr-1.5 h-4 w-4" />Show code</Button>
          {bio && <Button variant="outline" onClick={() => void run(async () => { if (await confirmWithBiometric("Show this code", checkPassword)) { setErr(""); setPw(""); setRevealed(true); } })}><Fingerprint className="mr-1.5 h-4 w-4" />Use fingerprint</Button>}
        </div> : <div className="space-y-3">
          <TotpCode uri={selected.content} />
          <Button variant="ghost" onClick={() => { setRevealed(false); setPw(""); }}>Hide code</Button>
        </div>}
        <div className="border-t border-border pt-4 space-y-2">
          <Label htmlFor="totp-delete-pw">Vault password to delete</Label>
          <CredentialInput id="totp-delete-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} />
          <Input aria-label="Delete confirmation" placeholder="Type DELETE to confirm" value={confirmation} onChange={e => setConfirmation(e.target.value)} />
          <Button variant="destructive" disabled={busy || confirmation !== "DELETE" || !checkPassword(pw)} onClick={() => void run(async () => { await saveSecrets(secrets.filter(s => s.id !== selected.id)); close(); toast.success("Account deleted."); })}><Trash2 className="mr-1.5 h-4 w-4" />Delete account</Button>
        </div>
        {error}
      </div> : <div className="space-y-4">
        <div className="space-y-2">
          {accounts.length === 0 && <p className="py-6 text-sm text-muted-foreground">No authenticator accounts yet.</p>}
          {accounts.map(s => <Button key={s.id} variant="outline" className="h-auto w-full justify-start gap-3 py-4" onClick={() => { setErr(""); setSelected(s); }}><Timer className="h-5 w-5 shrink-0" /><span className="min-w-0 text-left"><span className="block truncate">{s.name}</span><span className="block truncate text-xs text-muted-foreground">Authenticator</span></span></Button>)}
        </div>
        {!adding ? <Button className="w-full" onClick={() => { setErr(""); setAdding(true); }}><Plus className="mr-1.5 h-4 w-4" />Add account</Button> : <div className="space-y-3 rounded-md border border-border p-4">
          <p className="text-sm text-muted-foreground">Scan the QR a site shows when you turn on 2FA. Vault then makes the 6-digit codes offline.</p>
          <Button variant="outline" className="w-full" onClick={() => { setErr(""); setScan(true); }}><Camera className="mr-2 h-4 w-4" />{content ? "Scan again" : "Scan 2FA QR"}</Button>
          {content && <p className="text-sm text-muted-foreground">Scanned: {(() => { try { const p = parseOtpAuth(content); return p.issuer || p.label || "authenticator"; } catch { return "invalid code"; } })()}</p>}
          <Label htmlFor="totp-paste">Or paste the setup code</Label>
          <Input id="totp-paste" value={content} onChange={e => setContent(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} placeholder="otpauth://totp/… or base32 secret" />
          <Label htmlFor="totp-name">Name</Label>
          <Input id="totp-name" maxLength={200} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. GitHub, email" />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => { setAdding(false); setContent(""); setName(""); setErr(""); }}>Cancel</Button>
            <Button disabled={busy || !content} onClick={() => void run(async () => { const p = parseOtpAuth(content); const s = validateSecret({ id: crypto.randomUUID(), name: name.trim() || p.issuer || p.label || "Authenticator", type: "totp", content, createdAt: Date.now() }); await saveSecrets([...secrets, s]); setContent(""); setName(""); setAdding(false); toast.success("Authenticator saved."); })}><Plus className="mr-1.5 h-4 w-4" />Save</Button>
          </div>
        </div>}
        <p className="text-xs text-muted-foreground">Codes come from this phone's clock, so keep the time accurate. Accounts live inside your encrypted Vault and are included in every backup.</p>
        {scan && <ScannerDialog hint="Scan the site's 2FA setup QR." onClose={() => setScan(false)} onScan={text => { setScan(false); try { const p = parseOtpAuth(text); setContent(text.trim()); if (!name.trim()) setName(p.issuer || p.label || ""); } catch (e) { setErr((e as Error).message); } }} />}
        {error}
      </div>}
    </Unlocked>
  );
}
