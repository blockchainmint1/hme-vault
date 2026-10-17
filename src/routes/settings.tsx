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

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — HME Vault" }, { name: "description", content: "Manage fingerprint unlock, auto-lock and erase your offline Vault." }, { property: "og:title", content: "Settings — HME Vault" }, { property: "og:description", content: "Security settings for your offline Vault." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { checkPassword, changePassword, wipe } = useVault();
  const navigate = useNavigate();
  const [bio, setBio] = useState<BiometricStatus>({ available: false, enabled: false });
  const [bioPw, setBioPw] = useState("");
  const [wipePw, setWipePw] = useState("");
  const [wipeText, setWipeText] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [linking, setLinking] = useState(false);
  useEffect(() => { getBiometricStatus().then(setBio); }, []);

  return (
    <Unlocked title="Settings" back>
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Coin QR unlock</CardTitle><CardDescription>Replace this phone’s Vault password with a coin’s hidden recovery words. Existing backups keep their own passwords.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {!linking ? <Button variant="outline" onClick={() => setLinking(true)}>Link a coin</Button> : <>
              <CredentialInput aria-label="Current Vault password" placeholder="Current Vault password" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
              <CoinEnrollment disabled={!checkPassword(currentPw)} onEnroll={async password => {
                if (!checkPassword(currentPw)) throw new Error("Wrong password.");
                await disableBiometric();
                setBio(await getBiometricStatus());
                await changePassword(currentPw, password);
                setCurrentPw(""); setLinking(false);
                toast.success("Coin linked. Scan its hidden seed QR to unlock. Make a fresh backup; fingerprint unlock must be enabled again.");
              }} />
              <Button variant="ghost" onClick={() => { setLinking(false); setCurrentPw(""); }}>Cancel</Button>
            </>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fingerprint unlock</CardTitle>
            <CardDescription>{bio.available ? "Optional convenience unlock on this phone. Your password or hidden coin QR remains the recovery method." : "Not available on this device."}</CardDescription>
          </CardHeader>
          {bio.available && (
            <CardContent className="space-y-2">
              <p className="text-sm text-destructive">The current fingerprint option is checked by the app, not enforced when the phone releases the stored unlock secret. Do not rely on it against a compromised phone. It does not transfer with backups.</p>
              {!bio.enabled && <CredentialInput type="password" placeholder="Vault password" value={bioPw} onChange={(e) => setBioPw(e.target.value)} />}
              <div className="flex items-center gap-2">
                <Switch checked={bio.enabled} onCheckedChange={async (on) => {
                  try {
                    if (on) { if (!checkPassword(bioPw)) return toast.error("Wrong password."); await enableBiometric(bioPw); setBioPw(""); }
                    else await disableBiometric();
                    setBio(await getBiometricStatus());
                  } catch (e) { toast.error((e as Error).message); }
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
