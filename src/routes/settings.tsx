import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Unlocked } from "@/components/vault/Unlocked";
import { useVault } from "@/lib/vault/vault-context";
import { disableBiometric, enableBiometric, getBiometricStatus, type BiometricStatus } from "@/lib/native/biometric";
import { CoinEnrollment } from "@/components/vault/CoinEnrollment";
import { CredentialInput } from "@/components/vault/CredentialInput";
import { Label } from "@/components/ui/label";
import { combineCoinPassword, isCoinExtraRequired } from "@/lib/vault/coin-unlock";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — HME Vault" }, { name: "description", content: "Manage fingerprint unlock, auto-lock and erase your offline Vault." }, { property: "og:title", content: "Settings — HME Vault" }, { property: "og:description", content: "Security settings for your offline Vault." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { checkPassword, changePassword, wipe } = useVault();
  const navigate = useNavigate();
  const [bio, setBio] = useState<BiometricStatus>({ available: false, enabled: false });
  const [bioPw, setBioPw] = useState("");
  const [bioExtra, setBioExtra] = useState("");
  const [extraRequired, setExtraRequired] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [wipePw, setWipePw] = useState("");
  const [wipeText, setWipeText] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [linking, setLinking] = useState(false);
  useEffect(() => { getBiometricStatus().then(setBio); }, []);
  useEffect(() => { setExtraRequired(isCoinExtraRequired()); }, [linking]);

  return (
    <Unlocked title="Settings" back>
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Coin QR unlock</CardTitle><CardDescription>Replace this phone’s Vault password with whatever a coin’s QR holds. Existing backups keep their own passwords.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {!linking ? <Button variant="outline" onClick={() => setLinking(true)}>Link a coin</Button> : <>
              <CredentialInput aria-label="Current Vault password" placeholder="Current Vault password" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
              <CoinEnrollment disabled={!checkPassword(currentPw)} onEnroll={async password => {
                if (!checkPassword(currentPw)) throw new Error("Wrong password.");
                await disableBiometric();
                setBio(await getBiometricStatus());
                await changePassword(currentPw, password);
                setCurrentPw(""); setLinking(false);
                toast.success("Coin linked. Scan the same QR to unlock. Make a fresh backup; fingerprint unlock must be enabled again.");
              }} />
              <Button variant="ghost" onClick={() => { setLinking(false); setCurrentPw(""); }}>Cancel</Button>
            </>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fingerprint unlock</CardTitle>
            <CardDescription>{bio.available ? "Optional convenience unlock on this phone. Your password, or coin QR plus its extra secret word, remains the recovery method." : "Not available on this device."}</CardDescription>
          </CardHeader>
          {bio.available && (
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">Your phone seals the complete unlock credential behind a fingerprint check. Once enabled, fingerprint alone opens this phone’s Vault; it does not replace your recovery credential or transfer with backups.</p>
              {!bio.enabled && <>
                <CredentialInput type="password" aria-label="Fingerprint setup credential" placeholder={extraRequired ? "Scan coin QR" : "Vault password or scan coin QR"} value={bioPw} onChange={(e) => setBioPw(e.target.value)} disabled={bioBusy} />
                {extraRequired && <div className="space-y-1">
                  <Label htmlFor="fingerprint-extra-word">Extra secret word</Label>
                  <Input id="fingerprint-extra-word" type="password" autoComplete="off" value={bioExtra} onChange={e => setBioExtra(e.target.value)} disabled={bioBusy} />
                </div>}
              </>}
              <div className="flex items-center gap-2">
                <Switch aria-label="Fingerprint unlock" checked={bio.enabled} disabled={bioBusy} onCheckedChange={async (on) => {
                  setBioBusy(true);
                  try {
                    if (on) {
                      if (extraRequired && !bioExtra.trim()) return toast.error("Enter your extra secret word.");
                      const extra = extraRequired ? bioExtra : "";
                      if (!checkPassword(combineCoinPassword(bioPw, extra))) return toast.error("Wrong password or extra secret word.");
                      await enableBiometric(bioPw, extra);
                      setBioPw(""); setBioExtra("");
                    }
                    else await disableBiometric();
                    setBio(await getBiometricStatus());
                  } catch (e) { toast.error((e as Error).message); }
                  finally { setBioBusy(false); }
                }} />
                <span className="text-sm">{bio.enabled ? "On" : "Off"}</span>
              </div>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Auto-lock</CardTitle>
            <CardDescription>Locks after 2 minutes without use and as soon as you leave the app. Seeds hide 60 seconds after you show them.</CardDescription>
          </CardHeader>
        </Card>


        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base">Erase this vault</CardTitle>
            <CardDescription>Removes every seed, password, note and file from this phone. Only do this if you have a backup. <Link to="/backup" className="underline">Make a backup</Link></CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <CredentialInput type="password" placeholder="Vault password" value={wipePw} onChange={(e) => setWipePw(e.target.value)} />
            <Input placeholder='Type "ERASE" to confirm' value={wipeText} onChange={(e) => setWipeText(e.target.value)} />
            <Button variant="destructive" disabled={wipeText !== "ERASE" || !checkPassword(wipePw)} onClick={async () => { await disableBiometric(); wipe(); navigate({ to: "/" }); }}>Erase vault</Button>
          </CardContent>
        </Card>
      </div>
    </Unlocked>
  );
}
