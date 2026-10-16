import { createFileRoute, Link } from "@tanstack/react-router";
import { KeyRound, Plus, HardDriveDownload, Settings, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Unlocked } from "@/components/vault/Unlocked";
import { useVault } from "@/lib/vault/vault-context";

export const Route = createFileRoute("/seeds/")({
  head: () => ({ meta: [{ title: "My seeds — HME Seed Vault" }, { name: "description", content: "Seeds stored in your offline vault." }, { property: "og:title", content: "My seeds — HME Seed Vault" }, { property: "og:description", content: "Seeds stored in your offline vault." }] }),
  component: SeedsPage,
});

function SeedsPage() {
  const { seeds } = useVault();
  return (
    <Unlocked title="My seeds">
      <div className="space-y-2">
        {seeds.length === 0 && (
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">No seeds yet. Add your first one below.</CardContent></Card>
        )}
        {seeds.map((s) => (
          <Link key={s.id} to="/seeds/$id" params={{ id: s.id }} className="block">
            <Card className="hover:bg-muted/40 transition-colors">
              <CardContent className="flex items-center gap-3 py-4">
                <KeyRound className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {s.words.split(" ").length} words · {s.fingerprint}{s.passphrase ? " · + passphrase" : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-4 grid gap-2">
        <Button asChild><Link to="/seeds/new"><Plus className="h-4 w-4 mr-1.5" />Add a seed</Link></Button>
        <Button asChild variant="outline"><Link to="/sign"><PenLine className="h-4 w-4 mr-1.5" />Sign a payment</Link></Button>
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="secondary"><Link to="/backup"><HardDriveDownload className="h-4 w-4 mr-1.5" />Backup</Link></Button>
          <Button asChild variant="secondary"><Link to="/settings"><Settings className="h-4 w-4 mr-1.5" />Settings</Link></Button>
        </div>
      </div>
    </Unlocked>
  );
}
