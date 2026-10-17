import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/supported")({
  head: () => ({
    meta: [
      { title: "Supported transactions — HME Vault" },
      {
        name: "description",
        content:
          "Everything HME Vault can sign offline: TXC, ISK, BTC, LTC, DOGE and EVM transfers, plus watch-only pairing.",
      },
      { property: "og:title", content: "Supported transactions — HME Vault" },
      {
        property: "og:description",
        content:
          "Offline QR signing for TXC, ISK, BTC, LTC, DOGE and EVM native and ERC-20 transfers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportedPage,
});

const COINS = [
  {
    coin: "TEXITcoin (TXC)",
    types: "Legacy, nested segwit, segwit (txc1…)",
    note: "Omni layer-2 TXC sends included",
  },
  {
    coin: "Iskander (ISK)",
    types: "Legacy, nested segwit, segwit (isk1…)",
    note: "Same rules as TXC, own address path",
  },
  {
    coin: "Bitcoin (BTC)",
    types: "Legacy, nested segwit, segwit (bc1…)",
    note: "Coin-0 paths default to BTC",
  },
  {
    coin: "Litecoin (LTC)",
    types: "Legacy, nested segwit, segwit (ltc1…)",
    note: "",
  },
  {
    coin: "Dogecoin (DOGE)",
    types: "Legacy only (D…)",
    note: "No segwit on this chain",
  },
];

const CHAINS = [
  "Ethereum",
  "Optimism",
  "BNB Smart Chain",
  "Polygon",
  "Base",
  "Arbitrum One",
  "Avalanche C-Chain",
  "Sepolia (testnet)",
];

function SupportedPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link
        to="/"
        className="text-sm text-muted-foreground hover:text-foreground no-underline"
      >
        ← Home
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Supported transactions</h1>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        Vault never connects to the internet. Your online wallet builds an unsigned payment and
        shows it as a QR code; Vault scans it, shows you exactly what is leaving, signs it on the
        phone, and hands the signed payment back as a QR code.
      </p>

      <h2 className="mt-8 text-xl font-semibold tracking-tight">Bitcoin-family coins</h2>
      <div className="mt-4 not-prose overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Coin</th>
              <th className="px-3 py-2 font-medium">Address types</th>
              <th className="px-3 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {COINS.map((c) => (
              <tr key={c.coin} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{c.coin}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.types}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        Before signing, Vault checks every input against the seed stored on the device — master
        fingerprint, derivation path and script — and requires the standard SIGHASH_ALL signing
        mode. You also choose the network yourself, so a TXC payment can never be signed as BTC.
      </p>

      <h2 className="mt-8 text-xl font-semibold tracking-tight">Ethereum and other EVM networks</h2>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        Two kinds of payment: a plain coin transfer, and an ERC-20 token transfer. Both must name
        the chain, the sender and the fee up front — Vault will not sign an opaque contract call.
      </p>
      <p className="mt-3 leading-relaxed text-muted-foreground">
        Networks recognised by name: {CHAINS.join(", ")}. Any other EVM chain ID can still be
        signed; its amounts and fees are then shown as raw base units and you verify the chain ID
        yourself.
      </p>

      <h2 className="mt-8 text-xl font-semibold tracking-tight">Watch-only</h2>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        A pairing code shares the master fingerprint and account public keys (xpubs) for TXC, ISK,
        BTC, LTC and DOGE, plus the EVM address — enough for an online wallet to watch balances and
        prepare payments, never enough to spend. ZCU is watched by pasting or scanning its 0x
        address.
      </p>

      <h2 className="mt-8 text-xl font-semibold tracking-tight">What Vault will not sign</h2>
      <ul className="mt-4 list-disc space-y-1 pl-5 leading-relaxed text-muted-foreground">
        <li>Contract approvals, allowances, swaps, staking or arbitrary contract calls</li>
        <li>Message or "sign in" signatures</li>
        <li>Anything where the fee, recipient or network is unclear</li>
        <li>Anything that would need the vault to reach the internet</li>
      </ul>
      <p className="text-sm text-muted-foreground">
        Back to the <Link to="/">vault</Link>.
      </p>
    </main>
  );
}
