import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isNative } from "@/lib/native/platform";

const EXT = { target: "_blank", rel: "noreferrer" } as const;
const linkCls = "text-foreground underline underline-offset-4 hover:decoration-2";

/** Web-only marketing blurbs. The offline phone app shows no external links. */
export function HomeBlurbs() {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNative()), []);
  if (native) return null;
  return (
    <section className="space-y-4 border-t border-border/60 pt-6 text-sm leading-relaxed text-muted-foreground">
      <p>
        HME Vault is designed to work with a{" "}
        <a className={linkCls} href="https://store.google.com/product/pixel_10a" {...EXT}>
          Pixel 10a
        </a>
        ,{" "}
        <a className={linkCls} href="https://grapheneos.org/" {...EXT}>
          GrapheneOS
        </a>{" "}
        and a{" "}
        <a className={linkCls} href="https://blockchainmint.com/" {...EXT}>
          Cold Storage Coin
        </a>
        .
      </p>
      <p>
        Combined, these tools create an airgapped, ultra-secure way to store seeds and sign
        crypto transactions. For a full list of transaction types supported{" "}
        <Link to="/supported" className={linkCls}>
          click here
        </Link>
        .
      </p>
    </section>
  );
}
