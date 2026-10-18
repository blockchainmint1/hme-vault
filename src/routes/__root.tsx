import { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { CONTENT_SECURITY_POLICY_META } from "../lib/security/headers";
import { VaultProvider } from "../lib/vault/vault-context";
import { SiteFooter } from "../components/SiteFooter";
import { BackupReminder } from "../components/vault/BackupReminder";
import { Toaster } from "../components/ui/sonner";
import { ThemeProvider } from "../lib/theme";
import icon192 from "../assets/icons/icon-192.webp";

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('txc.theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <Link to="/" className="mt-4 inline-block underline">Go to the vault</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your stored seeds are not affected.</p>
        <p className="mt-2 break-words font-mono text-xs text-destructive">{(error as Error)?.message}</p>
        <button onClick={reset} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Try again</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      ...(import.meta.env.PROD ? [{ "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY_META }] : []),
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#ffffff" },
      { name: "robots", content: "noindex" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/webp", sizes: "192x192", href: icon192 },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="min-h-[100dvh] bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  // Native: block screenshots / screen recording and cover the app switcher.
  useEffect(() => {
    void (async () => {
      try {
        const { isNative } = await import("../lib/native/platform");
        if (!isNative()) return;
        const { PrivacyScreen } = await import("@capacitor-community/privacy-screen");
        await PrivacyScreen.enable();
      } catch {
        /* plugin missing on web */
      }
    })();
  }, []);

  return (
    <ThemeProvider>
      <VaultProvider>
        <div className="flex min-h-[100dvh] flex-col">
          <div className="flex-1"><Outlet /></div>
          <SiteFooter />
        </div>
        <Toaster />
        <BackupReminder />
      </VaultProvider>
    </ThemeProvider>
  );
}
