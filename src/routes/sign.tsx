import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, PenLine } from "lucide-react";
import type { Psbt } from "bitcoinjs-lib";
import type { HDKey } from "@scure/bip32";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CredentialInput } from "@/components/vault/CredentialInput";
import { Label } from "@/components/ui/label";
import { ScannerDialog } from "@/components/wallet/QrScanButton";
import { AnimatedQr } from "@/components/vault/AnimatedQr";
import { Unlocked } from "@/components/vault/Unlocked";
import { useVault } from "@/lib/vault/vault-context";
import { formatCoins, parsePsbt, reviewPsbt, signPsbt, type Review } from "@/lib/signer/psbt";
import { reviewEvm, signEvm, type EvmReview } from "@/lib/signer/evm";
import { COIN_IDS, type CoinId } from "@/lib/signer/networks";
import { EvmPaymentReview } from "@/components/vault/EvmPaymentReview";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PartCollector, SIGNING_PART_SIZE } from "@/lib/signer/qr-parts";
import { PartDots } from "@/components/vault/PartDots";
import { Fingerprint } from "lucide-react";
import { getBiometricStatus, unlockWithBiometric } from "@/lib/native/biometric";

export const Route = createFileRoute("/sign")({
  head: () => ({
    meta: [
      { title: "Sign a payment — HME Vault" },
      {
        name: "description",
        content: "Sign TXC, ISK, BTC, LTC, DOGE and EVM transfers offline by QR.",
      },
      { property: "og:title", content: "Sign a payment — HME Vault" },
      { property: "og:description", content: "Sign a payment offline by QR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignPage,
});

function SignPage() {
  const { seeds, checkPassword, status } = useVault();
  const [scan, setScan] = useState(false);
  const [progress, setProgress] = useState<{
    have: number;
    total: number;
    received: number[];
  } | null>(null);
  const collector = useRef(new PartCollector());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ psbt: Psbt; review: Review; keys: HDKey[] } | null>(null);
  const [pw, setPw] = useState("");
  const [signed, setSigned] = useState<{ hex: string; txid: string } | null>(null);

  const [network, setNetwork] = useState<CoinId | "EVM">("TXC");
  const [evm, setEvm] = useState<EvmReview | null>(null);
  const generation = useRef(0);
  const [bioOn, setBioOn] = useState(false);
  useEffect(() => {
    getBiometricStatus()
      .then((b) => setBioOn(b.enabled))
      .catch(() => setBioOn(false));
  }, []);

  async function withFingerprint(doSign: () => void | Promise<void>) {
    setErr("");
    try {
      const secret = await unlockWithBiometric();
      if (!secret) return;
      if (!checkPassword(secret)) {
        setErr("Fingerprint didn't match this Vault. Use your password.");
        return;
      }
      await doSign();
    } catch (e) {
      setBioOn(false);
      setErr((e as Error).message);
    }
  }

  async function signEvmNow() {
    if (!evm) return;
    setPw("");
    setBusy(true);
    setErr("");
    const run = generation.current;
    try {
      const result = await signEvm(evm, seeds);
      if (run === generation.current && active.current) setSigned(result);
    } catch (x) {
      if (run === generation.current && active.current) setErr((x as Error).message);
    } finally {
      if (run === generation.current) setBusy(false);
    }
  }

  function signPsbtNow() {
    if (!state || !active.current) return;
    setPw("");
    setErr("");
    try {
      setSigned(signPsbt(state.psbt, state.keys));
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  const fpButton = (doSign: () => void | Promise<void>) =>
    bioOn ? (
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={busy}
        onClick={() => void withFingerprint(doSign)}
      >
        <Fingerprint className="mr-1.5 h-4 w-4" />
        Approve with fingerprint
      </Button>
    ) : null;
  const active = useRef(status === "unlocked");
  active.current = status === "unlocked";
  useEffect(() => {
    if (status !== "unlocked") {
      generation.current++;
      setState(null);
      setEvm(null);
      setSigned(null);
      setPw("");
      setScan(false);
    }
    return () => {
      generation.current++;
    };
  }, [status]);

  async function load(text: string) {
    setErr("");
    setBusy(true);
    setState(null);
    setEvm(null);
    setSigned(null);
    const run = ++generation.current;
    try {
      if (network === "EVM") {
        const review = await reviewEvm(text, seeds);
        if (run === generation.current && active.current) setEvm(review);
      } else {
        const psbt = parsePsbt(text, network);
        const { review, keys } = await reviewPsbt(psbt, seeds, network);
        if (run === generation.current && active.current) setState({ psbt, review, keys });
      }
    } catch (e) {
      if (run === generation.current && active.current) setErr((e as Error).message);
    } finally {
      if (run === generation.current) setBusy(false);
    }
  }

  function onCode(code: string) {
    try {
      const full = collector.current.add(code);
      setProgress(collector.current.progress.total ? collector.current.progress : null);
      if (full) {
        setScan(false);
        collector.current = new PartCollector();
        setProgress(null);
        void load(full);
      }
    } catch (e) {
      setScan(false);
      setErr((e as Error).message);
      collector.current = new PartCollector();
      setProgress(null);
    }
  }

  function reset() {
    generation.current++;
    setBusy(false);
    setState(null);
    setEvm(null);
    setSigned(null);
    setPw("");
    setErr("");
  }

  if (signed && (state || evm)) {
    return (
      <Unlocked title="Signed" back>
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm">
              Scan this with your online wallet to send it. This phone never sends anything.
            </p>
            <AnimatedQr value={signed.hex} frameSize={SIGNING_PART_SIZE} />
            <p className="break-all font-mono text-xs text-muted-foreground">
              Transaction ID: {signed.txid}
            </p>
            <Button variant="secondary" onClick={reset}>
              Done
            </Button>
          </CardContent>
        </Card>
      </Unlocked>
    );
  }

  if (evm)
    return (
      <Unlocked title="Check this payment" back>
        <div className="space-y-3">
          <EvmPaymentReview review={evm} />
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!checkPassword(pw)) {
                setErr("Wrong password.");
                setPw("");
                return;
              }
              await signEvmNow();
            }}
          >
            {fpButton(signEvmNow)}
            <Label htmlFor="epw">
              {bioOn ? "Or type your Vault password" : "Vault password to sign"}
            </Label>
            <CredentialInput
              id="epw"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            {err && <p className="text-sm text-destructive">{err}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={reset}>
                Cancel
              </Button>
              <Button className="flex-1" type="submit" disabled={!pw || busy}>
                <PenLine className="mr-1.5 h-4 w-4" />
                {busy ? "Signing…" : "Sign"}
              </Button>
            </div>
          </form>
        </div>
      </Unlocked>
    );

  if (state) {
    const r = state.review;
    return (
      <Unlocked title="Check this payment" back>
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {r.coin} from “{r.seedName}”
              </CardTitle>
              <CardDescription>
                Compare every address with the one you meant to pay.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {r.token && (
                <div className="rounded-md border-2 border-primary p-3">
                  <p className="text-xs text-muted-foreground">Token transfer</p>
                  <p className="text-lg font-semibold">
                    {r.token.amount} {r.token.symbol}
                  </p>
                  {r.token.to && <p className="break-all font-mono text-sm">to {r.token.to}</p>}
                  {r.token.recipients && (
                    <div className="mt-3 divide-y divide-border">
                      {r.token.recipients.map((recipient) => (
                        <div key={recipient.vout} className="py-2 space-y-1">
                          <p className="text-sm font-semibold">
                            {recipient.amount} {r.token?.symbol}
                          </p>
                          <p className="break-all font-mono text-sm">to {recipient.address}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {r.outputs
                .filter((o) => !o.isChange)
                .map((o, i) => (
                  <div key={i} className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">
                      {o.isData ? "Extra data" : "Pay to"}
                    </p>
                    <p className="break-all font-mono text-sm">{o.address}</p>
                    <p className="mt-1 text-lg font-semibold">
                      {formatCoins(o.sats)} {r.coin}
                    </p>
                  </div>
                ))}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Network fee</span>
                <span className="text-right font-medium">
                  {formatCoins(r.feeSats)} {r.coin}
                </span>
                <span className="text-muted-foreground">Fee rate (at least)</span>
                <span className="text-right">{r.feeRateMinimum.toString()} base units/vB</span>
                <span className="text-muted-foreground">Back to you (change)</span>
                <span className="text-right">
                  {formatCoins(r.changeSats)} {r.coin}
                </span>
                <span className="text-muted-foreground">Total leaving</span>
                <span className="text-right font-semibold">
                  {formatCoins(r.sendSats + r.feeSats)} {r.coin}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Fee rate uses the maximum signed size of {r.maximumVsize} vB; the exact rate is
                checked again before a signed QR is returned. This phone cannot check current
                network fees.
              </p>
              {r.warnings.map((w) => (
                <p
                  key={w}
                  className="flex gap-2 rounded-md border border-destructive/50 p-2 text-sm"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                  {w}
                </p>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 pt-6">
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!checkPassword(pw)) {
                    setErr("Wrong password.");
                    setPw("");
                    return;
                  }
                  signPsbtNow();
                }}
              >
                {fpButton(signPsbtNow)}
                <Label htmlFor="spw">
                  {bioOn ? "Or type your Vault password" : "Vault password to sign"}
                </Label>
                <CredentialInput
                  id="spw"
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                />
                {err && <p className="text-sm text-destructive">{err}</p>}
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={reset}>
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" disabled={!pw}>
                    <PenLine className="h-4 w-4 mr-1.5" />
                    Sign
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </Unlocked>
    );
  }

  return (
    <Unlocked title="Sign a payment" back>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm">
            On your online wallet, make the payment as “unsigned / for offline signing”, then scan
            its QR here. TXC, ISK, BTC, LTC, DOGE or EVM transfers.
          </p>
          <Label htmlFor="sign-network">Payment network</Label>
          <Select
            value={network}
            disabled={busy}
            onValueChange={(value) => {
              if (value === "EVM" || COIN_IDS.includes(value as CoinId)) {
                reset();
                setNetwork(value as CoinId | "EVM");
              }
            }}
          >
            <SelectTrigger id="sign-network">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...COIN_IDS, "EVM"].map((coin) => (
                <SelectItem key={coin} value={coin}>
                  {coin}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="w-full"
            disabled={busy || seeds.length === 0}
            onClick={() => {
              collector.current = new PartCollector();
              setScan(true);
            }}
          >
            <Camera className="h-4 w-4 mr-1.5" />
            {busy ? "Checking…" : "Scan unsigned payment"}
          </Button>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </CardContent>
      </Card>
      {scan && (
        <ScannerDialog
          keepScanning
          hint={
            progress
              ? `Got part ${progress.have} of ${progress.total}… keep pointing.`
              : "Point the camera at the unsigned payment QR."
          }
          extra={progress && <PartDots total={progress.total} received={progress.received} />}
          onClose={() => {
            setScan(false);
            setProgress(null);
          }}
          onScan={onCode}
        />
      )}
    </Unlocked>
  );
}
