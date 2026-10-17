import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Unlocked } from "@/components/vault/Unlocked";
import { useVault } from "@/lib/vault/vault-context";
import { deriveKeys, isValidSeed, newSeedWords } from "@/lib/vault/seeds";
import { normalizeSeed } from "@/lib/vault/format";
import { wordsFromScan } from "@/lib/vault/scan-seed";
import { QrScanButton } from "@/components/wallet/QrScanButton";

export const Route = createFileRoute("/seeds/new")({
  head: () => ({ meta: [{ title: "Add a seed — HME Vault" }, { name: "description", content: "Create or enter a recovery seed." }, { property: "og:title", content: "Add a seed — HME Vault" }, { property: "og:description", content: "Create or enter a recovery seed." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: NewSeed,
});

function useAdd() {
  const { seeds, save } = useVault();
  const navigate = useNavigate();
  return async (name: string, words: string, passphrase: string) => {
    const w = normalizeSeed(words);
    if (seeds.some((s) => s.words === w && (s.passphrase ?? "") === passphrase)) throw new Error("That seed is already in your vault.");
    const { fingerprint } = await deriveKeys(w, passphrase);
    const id = crypto.randomUUID();
    await save([...seeds, { id, name: name.trim() || `Seed ${seeds.length + 1}`, words: w, ...(passphrase ? { passphrase } : {}), fingerprint, createdAt: Date.now() }]);
    navigate({ to: "/seeds/$id", params: { id } });
  };
}

function NameAndPass({ name, setName, pass, setPass }: { name: string; setName: (v: string) => void; pass: string; setPass: (v: string) => void }) {
  return (
    <>
      <div><Label htmlFor="name">Name</Label><Input id="name" placeholder="e.g. Main TXC" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div>
        <Label htmlFor="pp">Extra passphrase (optional)</Label>
        <Input id="pp" type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} />
        <p className="mt-1 text-xs text-muted-foreground">Only if your wallet uses one ("25th word"). Leave empty otherwise.</p>
      </div>
    </>
  );
}

function NewSeed() {
  return (
    <Unlocked title="Add a seed" back>
      <Tabs defaultValue="enter">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="enter">I have one</TabsTrigger>
          <TabsTrigger value="make">Make a new one</TabsTrigger>
        </TabsList>
        <TabsContent value="enter"><EnterSeed /></TabsContent>
        <TabsContent value="make"><MakeSeed /></TabsContent>
      </Tabs>
    </Unlocked>
  );
}

function EnterSeed() {
  const add = useAdd();
  const [name, setName] = useState("");
  const [words, setWords] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setErr("");
    if (!isValidSeed(words)) return setErr("Those words aren't a valid recovery phrase. Check spelling, order and count.");
    setBusy(true);
    try { await add(name, words, pass); } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <Card><CardContent className="space-y-3 pt-6">
      <div>
        <div className="flex items-center justify-between gap-2"><Label htmlFor="w">Recovery words (12, 15, 18, 21 or 24)</Label><QrScanButton onScan={(t) => { setErr(""); setWords(wordsFromScan(t)); }} /></div>
        <Textarea id="w" rows={4} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={words} onChange={(e) => setWords(e.target.value)} />
        <p className="mt-1 text-xs text-muted-foreground">Tap the camera to scan a seed QR (plain words or SeedQR).</p>
      </div>
      <NameAndPass name={name} setName={setName} pass={pass} setPass={setPass} />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button className="w-full" disabled={busy || !words} onClick={go}>{busy ? "Saving…" : "Save to vault"}</Button>
    </CardContent></Card>
  );
}

function MakeSeed() {
  const add = useAdd();
  const [count, setCount] = useState<12 | 24>(24);
  const [words, setWords] = useState("");
  const [step, setStep] = useState<"pick" | "write" | "check">("pick");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const list = words.split(" ");
  const quiz = useMemo(() => {
    const idx = new Set<number>();
    const r = new Uint32Array(8);
    crypto.getRandomValues(r);
    for (const n of r) { if (idx.size < 3) idx.add(n % list.length); }
    return [...idx].sort((a, b) => a - b);
  }, [words]); // eslint-disable-line react-hooks/exhaustive-deps

  async function finish() {
    setErr("");
    if (quiz.some((i) => (answers[i] ?? "").trim().toLowerCase() !== list[i])) return setErr("One of those words doesn't match. Check what you wrote down.");
    try { await add(name, words, pass); } catch (e) { setErr((e as Error).message); }
  }

  if (step === "pick") {
    return (
      <Card><CardContent className="space-y-3 pt-6">
        <p className="text-sm">Words are made from this device's secure random generator.</p>
        <div className="grid grid-cols-2 gap-2">
          {([12, 24] as const).map((n) => <Button key={n} variant={count === n ? "default" : "outline"} onClick={() => setCount(n)}>{n} words</Button>)}
        </div>
        <Button className="w-full" onClick={() => { setWords(newSeedWords(count)); setStep("write"); }}>Make my words</Button>
      </CardContent></Card>
    );
  }
  if (step === "write") {
    return (
      <Card><CardContent className="space-y-3 pt-6">
        <p className="text-sm font-medium">Write these down on paper, in order.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {list.map((w, i) => <div key={i} className="flex gap-2 rounded-md border border-border px-3 py-2 font-mono text-sm"><span className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>{w}</div>)}
        </div>
        <Button className="w-full" onClick={() => setStep("check")}>I wrote them down</Button>
      </CardContent></Card>
    );
  }
  return (
    <Card><CardContent className="space-y-3 pt-6">
      <p className="text-sm">Check your paper copy: type these words.</p>
      {quiz.map((i) => (
        <div key={i}><Label htmlFor={`q${i}`}>Word #{i + 1}</Label><Input id={`q${i}`} autoComplete="off" autoCapitalize="none" value={answers[i] ?? ""} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} /></div>
      ))}
      <NameAndPass name={name} setName={setName} pass={pass} setPass={setPass} />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setStep("write")}>Show words again</Button>
        <Button className="flex-1" onClick={finish}>Save to vault</Button>
      </div>
    </CardContent></Card>
  );
}
