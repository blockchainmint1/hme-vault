import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVault } from "@/lib/vault/vault-context";

/** Page frame for screens that need the vault open; sends you to the lock screen otherwise. */
export function Unlocked({ title, back, children }: { title: string; back?: boolean; children: ReactNode }) {
  const { status, lock } = useVault();
  const navigate = useNavigate();
  useEffect(() => {
    if (status === "locked" || status === "none") navigate({ to: "/" });
  }, [status, navigate]);
  if (status !== "unlocked") return null;
  return (
    <main className="mx-auto max-w-xl px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-2 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {back && <Link to="/seeds" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>}
          <h1 className="text-xl font-semibold truncate">{title}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={lock}><Lock className="h-4 w-4 mr-1.5" />Lock</Button>
      </header>
      {children}
    </main>
  );
}
