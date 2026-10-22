import { Link, useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** Seeds / Secrets / Authenticator switcher shown at the top of each vault page. */
export function VaultTabs() {
  const { pathname } = useLocation();
  const active = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  return (
    <nav aria-label="Vault sections" className="mb-4 grid grid-cols-3 gap-2">
      <Button
        asChild
        size="sm"
        className="px-2"
        variant={active("/seeds") ? "outline" : "secondary"}
      >
        <Link to="/seeds">Seeds</Link>
      </Button>
      <Button
        asChild
        size="sm"
        className="px-2"
        variant={active("/secrets") ? "outline" : "secondary"}
      >
        <Link to="/secrets">Secrets</Link>
      </Button>
      <Button
        asChild
        size="sm"
        className="px-2"
        variant={active("/authenticator") ? "outline" : "secondary"}
      >
        <Link to="/authenticator">Authenticator</Link>
      </Button>
    </nav>
  );
}
