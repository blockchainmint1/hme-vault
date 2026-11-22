import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { KeyRound, QrCode, ShieldAlert, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CredentialInput } from "@/components/vault/CredentialInput";
import { AnimatedQr } from "@/components/vault/AnimatedQr";
import { Unlocked } from "@/components/vault/Unlocked";
import { ScannerDialog } from "@/components/wallet/QrScanButton";
import { getBiometricStatus, unlockWithBiometric } from "@/lib/native/biometric";
import { POCKET_COINS, POCKET_SPECS } from "@/lib/pockets/coins";
import { SIGNING_PART_SIZE } from "@/lib/signer/qr-parts";
import {
  buildBranchAnswer,
  readBranchRequest,
  type BranchRequest,
} from "@/lib/signer/branch-access";
import { useVault } from "@/lib/vault/vault-context";

export const Route = createFileRoute("/branch-access")({
  head: () => ({
    meta: [
      { title: "Share branch access — HME Vault" },
      {
        name: "description",
        content:
          "Hand one trading pocket to a service that asked for it, after its signed request verifies.",
      },
      { property: "og:title", content: "Share branch access — HME Vault" },
      {
        property: "og:description",
        content:
          "Offline approval of a service's signed request: one pocket, never your recovery words.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BranchAccessPage,
});

function BranchAccessPage() {
  return (
    <Unlocked title="Share branch access" back>
      <BranchFlow />
    </Unlocked>
  );
}

function secondsLeft(expiresAt: number): number {
  return Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
}

function BranchFlow() {
  const { seeds, checkPassword, status } = useVault();
  const [scan, setScan] = useState(false);
  const [paste, setPaste] = useState("");
  const [request, setRequest] = useState<BranchRequest | null>(null);
  const [seedId, setSeedId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [left, setLeft] = useState(0);
  const [bioOn, setBioOn] = useState(false);

  useEffect(() => {
    getBiometricStatus()
      .then((s) => setBioOn(s.available && s.enabled))
      .catch(() => setBioOn(false));
  }, []);

  // A request that lapses while it is on screen stops being usable immediately.
  useEffect(() => {
    if (!request) return;
    setLeft(secondsLeft(request.expiresAt));
    const t = setInterval(() => {
      const n = secondsLeft(request.expiresAt);
      setLeft(n);
      if (n <= 0) {
        clear();
        setErr("That request expired. Start again on the service.");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [request]);

  function clear() {
    setRequest(null);
    setAnswer("");
    setSeedId("");
    setPw("");
    setPaste("");
  }

  function accept(text: string) {
    setErr("");
    try {
      const r = readBranchRequest(text);
      setRequest(r);
      setScan(false);
      setPaste("");
    } catch (e) {
      setErr((e as Error).message);
      setScan(false);
    }
  }

  const usable = useMemo(() => seeds.filter((s) => s.handsOff !== true), [seeds]);
  const seed = usable.find((s) => s.id === seedId);

  async function handOver() {
    if (!request || !seed) return;
    setBusy(true);
    setErr("");
    try {
      setAnswer(await buildBranchAnswer(request, seed));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function withFingerprint() {
    if (!request || !seed) return;
    try {
      const secret = await unlockWithBiometric();
      if (!secret) return;
      if (!checkPassword(secret)) {
        setErr("Fingerprint didn't match this Vault. Use your password.");
        return;
      }
      await handOver();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (status !== "unlocked") return null;

  if (answer && request) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium">
          Show these codes to {request.service}. They expire in {left}s.
        </p>
        <AnimatedQr value={answer} frameSize={SIGNING_PART_SIZE} size={300} />
        <p className="text-xs text-muted-foreground">
          Nothing is sent from this phone. The answer is sealed so only {request.service} can open
          it, and it holds pocket {request.pocket} only — not your recovery words.
        </p>
        <Button className="w-full" onClick={clear}>
          Done
        </Button>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Start the link on the service's own screen, then scan the request it shows. Vault only
          continues if that request is signed by a key this Vault already trusts.
        </p>
        <Button className="w-full" onClick={() => setScan(true)}>
          <QrCode className="mr-1.5 h-4 w-4" />
          Scan the service's request
        </Button>
        <div className="space-y-2">
          <Label htmlFor="req">Or paste the request</Label>
          <Textarea
            id="req"
            rows={4}
            spellCheck={false}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Signed request from the service"
          />
          <Button
            className="w-full"
            variant="outline"
            disabled={!paste.trim()}
            onClick={() => accept(paste)}
          >
            Check the request
          </Button>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {scan && (
          <ScannerDialog
            hint="Point the camera at the service's request QR."
            onClose={() => setScan(false)}
            onScan={accept}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 space-y-1">
        <p className="text-sm font-semibold">{request.service}</p>
        <p className="text-sm">
          Pocket <span className="font-mono">{request.pocket}</span> · match code{" "}
          <span className="font-mono">{request.matchCode}</span> ·{" "}
          <span className="inline-flex items-center gap-1">
            <Timer className="h-3.5 w-3.5" /> {left}s left
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Confirm the match code is the same one the service is showing you.
        </p>
      </div>

      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
        <p className="flex items-start gap-2 text-sm font-medium">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {request.service} will be able to trade from pocket {request.pocket} without asking you
          again. Your savings and recovery phrase stay on this phone.
        </p>
        <p className="text-sm">Only link from a {request.service} screen you started yourself.</p>
        <p className="text-xs text-muted-foreground">
          Handing over a pocket cannot be undone from here. To take it back you revoke access on
          {request.service}, which does not rotate the keys — move funds to fresh keys if you think
          they were exposed.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">
          Pocket {request.pocket} covers {POCKET_COINS.length} chains
        </p>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {POCKET_COINS.map((c) => (
            <li key={c}>
              <span className="font-medium text-foreground">{c}</span> {POCKET_SPECS[c].name}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bseed">Which seed's pocket</Label>
        <Select value={seedId} onValueChange={setSeedId}>
          <SelectTrigger id="bseed">
            <SelectValue placeholder="Choose a seed" />
          </SelectTrigger>
          <SelectContent>
            {usable.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} · {s.fingerprint}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {usable.length === 0 && (
          <p className="text-sm text-destructive">
            This Vault has no seed that can hand over access.
          </p>
        )}
        {seeds.length > usable.length && (
          <p className="text-xs text-muted-foreground">Hands-off copies can't hand over access.</p>
        )}
      </div>

      {seed && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!checkPassword(pw)) {
              setErr("Wrong password.");
              setPw("");
              return;
            }
            void handOver();
          }}
        >
          <Label htmlFor="bpw">
            {bioOn ? "Or type your Vault password" : "Vault password to hand over"}
          </Label>
          <CredentialInput
            id="bpw"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          {bioOn && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void withFingerprint()}
            >
              <KeyRound className="mr-1.5 h-4 w-4" />
              Use fingerprint
            </Button>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={clear}>
              Cancel
            </Button>
            <Button className="flex-1" type="submit" disabled={!pw || busy}>
              {busy ? "Preparing…" : `Hand over pocket ${request.pocket}`}
            </Button>
          </div>
        </form>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}
