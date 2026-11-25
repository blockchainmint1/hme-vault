import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, QrCode, ShieldAlert, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { parseAccountPath, POCKET_SPECS } from "@/lib/pockets/coins";
import { SIGNING_PART_SIZE } from "@/lib/signer/qr-parts";
import {
  branchAnswerSeedId,
  branchConsequence,
  handOverPocket,
  HandoverGuard,
  readBranchRequest,
  seedNameConfirmed,
  unsupportedBranchPaths,
  type BranchRequest,
  type HandoverTicket,
} from "@/lib/signer/branch-access";
import { useVault } from "@/lib/vault/vault-context";
import { recordPocketShare } from "@/lib/vault/seeds";

export const Route = createFileRoute("/branch-access")({
  head: () => ({
    meta: [
      { title: "Share a trading pocket — HME Vault" },
      {
        name: "description",
        content:
          "Hand one trading pocket to a service that asked for it, after its signed request verifies.",
      },
      { property: "og:title", content: "Share a trading pocket — HME Vault" },
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
    <Unlocked title="Share a pocket" back>
      <BranchFlow />
    </Unlocked>
  );
}

function secondsLeft(expiresAt: number): number {
  return Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
}

function BranchFlow() {
  const { seeds, save, checkPassword, status } = useVault();
  const [scan, setScan] = useState(false);
  const [paste, setPaste] = useState("");
  const [request, setRequest] = useState<BranchRequest | null>(null);
  const [seedId, setSeedId] = useState("");
  const [pw, setPw] = useState("");
  const [typedName, setTypedName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [left, setLeft] = useState(0);
  const [bioOn, setBioOn] = useState(false);
  const [showPaths, setShowPaths] = useState(false);
  // Only the latest approval may finish; anything that cancels makes it stale.
  const guard = useRef(new HandoverGuard());

  // Leaving the screen (including the lock, which unmounts it) cancels any
  // pending hand-over so nothing is shown or recorded late.
  useEffect(() => {
    const g = guard.current;
    return () => g.cancel();
  }, []);

  useEffect(() => {
    if (status !== "unlocked") clear();
  }, [status]);

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
    guard.current.cancel();
    setBusy(false);
    setRequest(null);
    setAnswer("");
    setSeedId("");
    setPw("");
    setTypedName("");
    setPaste("");
    setShowPaths(false);
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

  // Hands-off copies never share a trading pocket.
  const usable = useMemo(() => seeds.filter((s) => s.handsOff !== true), [seeds]);
  const seed = usable.find((s) => s.id === seedId);
  const nameOk = seed ? seedNameConfirmed(typedName, seed) : false;
  const unsupportedPaths = request ? unsupportedBranchPaths(request) : [];

  async function handOver(ticket: HandoverTicket) {
    if (!seed || !guard.current.isCurrent(ticket)) return;
    setBusy(true);
    setErr("");
    try {
      // Built first, then recorded, then re-checked: if the record can't be
      // saved, the request lapsed, or the owner cancelled, nothing is shown.
      const built = await handOverPocket({
        guard: guard.current,
        ticket,
        seed,
        typedName,
        record: () =>
          save(
            recordPocketShare(seeds, seed.id, {
              service: ticket.request.service,
              pocket: ticket.request.pocket,
              at: Date.now(),
            }),
          ),
      });
      if (built !== null && guard.current.isCurrent(ticket)) setAnswer(built);
    } catch (e) {
      if (guard.current.isCurrent(ticket)) setErr((e as Error).message);
    } finally {
      if (guard.current.isCurrent(ticket)) setBusy(false);
    }
  }

  async function withFingerprint() {
    if (!request || !seed) return;
    if (!nameOk) {
      setErr("Type the seed name exactly.");
      return;
    }
    const ticket = guard.current.begin(request, seed.id);
    try {
      const secret = await unlockWithBiometric();
      // Cancelled or changed while the fingerprint prompt was open.
      if (!secret || !guard.current.isCurrent(ticket)) return;
      if (!checkPassword(secret)) {
        setErr("Fingerprint didn't match this Vault. Use your password.");
        return;
      }
      await handOver(ticket);
    } catch (e) {
      if (guard.current.isCurrent(ticket)) setErr((e as Error).message);
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
        {branchAnswerSeedId(answer) && (
          <p className="text-sm">
            {request.service} will name this account{" "}
            <span className="font-mono font-medium">Vault {branchAnswerSeedId(answer)}</span>.
          </p>
        )}
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
        {branchConsequence(request).map((line, i) => (
          <p
            key={line}
            className={i === 0 ? "flex items-start gap-2 text-sm font-medium" : "text-sm"}
          >
            {i === 0 && <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
            {line}
          </p>
        ))}
        <p className="text-xs text-muted-foreground">
          Only share from a {request.service} screen you started yourself. If you think the keys
          were exposed, move the coins to a fresh pocket.
        </p>
      </div>

      {unsupportedPaths.length > 0 && (
        <div className="border-l-2 border-destructive pl-3 space-y-2">
          <p className="text-sm font-medium">
            Seeds also requested {unsupportedPaths.length} additional coin
            {unsupportedPaths.length === 1 ? "" : "s"}. This Vault will not share those keys.
          </p>
          <p className="text-sm text-muted-foreground">
            Only the {request.paths.length} chains listed below are included. The additional coins
            are unavailable through this link.
          </p>
          <ul className="space-y-1 text-xs font-mono break-all">
            {unsupportedPaths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">
          Pocket {request.pocket} covers {request.paths.length} chains
        </p>
        <p className="text-xs text-muted-foreground">
          Ethereum, HyperEVM (HYPE) and Avalanche C-Chain (AVAX) use the same EVM pocket key.
        </p>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {request.paths.map((path) => {
            const coin = parseAccountPath(path)?.coin;
            return (
              <li key={path}>
                <span className="font-medium text-foreground">{coin ?? "?"}</span>{" "}
                {coin ? POCKET_SPECS[coin].name : path}
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-xs"
          onClick={() => setShowPaths((v) => !v)}
        >
          {showPaths ? "Hide exact paths" : "Show exact paths"}
        </Button>
        {showPaths && (
          <ul className="space-y-0.5 rounded-md border p-2 font-mono text-xs break-all">
            {request.paths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="bseed">Which seed's pocket</Label>
        <Select
          value={seedId}
          onValueChange={(v) => {
            guard.current.cancel();
            setBusy(false);
            setSeedId(v);
            setTypedName("");
          }}
        >
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
        {seed && (
          <p className="text-xs text-muted-foreground">
            {request.service} will also see this seed's ID,{" "}
            <span className="font-mono">{seed.fingerprint}</span>, and use it as the account name.
            Its name and recovery words stay here.
          </p>
        )}
        {usable.length === 0 && (
          <p className="text-sm text-destructive">
            This Vault has no seed that can share a trading pocket.
          </p>
        )}
        {seeds.length > usable.length && (
          <p className="text-xs text-muted-foreground">
            Hands-off copies can't share a trading pocket.
          </p>
        )}
      </div>

      {seed && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nameOk) {
              setErr("Type the seed name exactly.");
              return;
            }
            if (!checkPassword(pw)) {
              setErr("Wrong password.");
              setPw("");
              return;
            }
            setPw("");
            void handOver(guard.current.begin(request, seed.id));
          }}
        >
          <Label htmlFor="bname">Type “{seed.name}” to confirm</Label>
          <Input
            id="bname"
            autoComplete="off"
            spellCheck={false}
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
          />
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
              disabled={!nameOk || busy}
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
            <Button className="flex-1" type="submit" disabled={!pw || !nameOk || busy}>
              {busy ? "Preparing…" : `Hand over pocket ${request.pocket}`}
            </Button>
          </div>
        </form>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}
