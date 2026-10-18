import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, BookOpen, Download, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import vaultMark from "@/assets/brand/vault-mark.png";
import vaultApk from "@/assets/vault-apk.apk.asset.json";

export const Route = createFileRoute("/tutorial")({
  head: () => ({
    meta: [
      { title: "Setup & first payment tutorial — HME Vault" },
      { name: "description", content: "Set up a Pixel 10a with GrapheneOS, install HME Vault, create and back up a seed, pair an online wallet and sign a payment offline." },
      { property: "og:title", content: "Setup & first payment tutorial — HME Vault" },
      { property: "og:description", content: "Seven steps from a dedicated offline phone to encrypted backups and QR payment signing." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TutorialPage,
});

const steps = [
  ["phone", "Get a Pixel 10a"],
  ["grapheneos", "Install GrapheneOS"],
  ["app", "Install HME Vault"],
  ["seed", "Create your new seed"],
  ["backup", "Back it up"],
  ["wallet", "Add a Vault to HME Wallet"],
  ["payment", "Send a Vault transaction"],
] as const;

function Resource({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-foreground underline underline-offset-4">{children}<ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></a>;
}

function Step({ number, children }: { number: number; children: ReactNode }) {
  const step = steps[number - 1];
  if (!step) return null;
  return <section id={step[0]} className="scroll-mt-6 border-t border-border py-8">
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-sm text-secondary-foreground">{number}</span>
      <h2 className="pt-0.5 text-xl font-semibold">{step[1]}</h2>
    </div>
    <div className="space-y-4 leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground [&_ol]:list-decimal [&_ol]:space-y-3 [&_ol]:pl-5">{children}</div>
  </section>;
}

function TutorialPage() {
  return <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
    <Button asChild variant="ghost" size="sm"><Link to="/"><ArrowLeft />Home</Link></Button>
    <header className="mb-8 mt-6">
      <img src={vaultMark} alt="HME Vault silver vault door" className="mb-5 h-20 w-20 rounded-lg object-contain" />
      <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><BookOpen className="h-4 w-4" />Setup & first payment</p>
      <h1 className="text-3xl font-semibold sm:text-4xl">HME Vault tutorial</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">Your offline Pixel holds the keys. Your everyday phone watches balances and sends payments. QR codes carry the information between them—not your seed.</p>
    </header>

    <aside className="mb-8 border-l-2 border-primary pl-4 text-sm leading-relaxed">
      <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 shrink-0" />Practice before moving real funds</p>
      <p className="mt-2 text-muted-foreground">Start with a throwaway seed. Test recovery on your second device and the complete signing round trip first. This setup reduces exposure; it is not a guarantee against every attack or a substitute for an independent security review.</p>
    </aside>

    <nav aria-label="Tutorial steps" className="mb-8">
      <ol className="grid gap-3 text-sm sm:grid-cols-2">
        {steps.map(([id, title], index) => <li key={id}><a href={`#${id}`} className="flex items-center gap-3 text-muted-foreground hover:text-foreground"><span className="font-mono text-xs">0{index + 1}</span><span className="underline underline-offset-4">{title}</span></a></li>)}
      </ol>
    </nav>

    <Step number={1}>
      <p>Use a <strong>dedicated Pixel 10a</strong>, not your everyday phone. You will also need an internet-connected computer for installation, a USB data cable, your everyday phone for HME Wallet, and ideally a USB-C drive and a second offline Pixel for backups.</p>
      <ol>
        <li>Buy a phone that allows <strong>OEM unlocking</strong>. SIM-unlocked alone does not guarantee this. Ask the seller before buying; avoid carrier models that block bootloader unlocking.</li>
        <li>Check the current supported-device list and installation requirements before starting.</li>
      </ol>
      <p><Resource href="https://store.google.com/product/pixel_10a">Find a Pixel 10a</Resource>{" · "}<Resource href="https://grapheneos.org/faq#supported-devices">GrapheneOS supported devices</Resource></p>
    </Step>

    <Step number={2}>
      <p>Install the operating system <strong>before creating any real secrets</strong>. Unlocking or relocking the bootloader wipes the phone.</p>
      <ol>
        <li>On your computer, open the official GrapheneOS web installer. Follow its current browser, cable and phone preparation instructions.</li>
        <li>Follow the installer through unlocking the bootloader, downloading and flashing GrapheneOS, and <strong>relocking the bootloader</strong>. Do not stop with it unlocked.</li>
        <li>Follow the guide’s verification and post-install steps, including disabling OEM unlocking again. Complete first-time setup, install current system updates and set a strong screen-lock PIN or password. Enrol a fingerprint if you want convenient Vault unlocking later.</li>
      </ol>
      <p><Resource href="https://grapheneos.org/install/web">Official GrapheneOS installation guide</Resource></p>
      <p className="text-sm">Use the official guide as the source of truth; installation screens and supported browser versions can change.</p>
    </Step>

    <Step number={3}>
      <ol>
        <li>Download the Android app on your <strong>online computer</strong> using the link below or “Android app” in this website’s footer.</li>
        <li>Connect the Pixel by USB. Choose file transfer on the Pixel and copy the APK into its Downloads folder.</li>
        <li>Open Files on the Pixel, tap the APK, and allow that file-opening app to install unknown apps if Android asks. Install HME Vault, then turn that permission off again.</li>
        <li>Before creating a seed, remove any SIM, disable any eSIM, turn on airplane mode, and separately check that <strong>Wi-Fi and Bluetooth are off</strong>. Disconnect the computer. Keep this Pixel offline from now on.</li>
      </ol>
      <Button asChild variant="outline"><a href={vaultApk.url} download="hme-vault-release.apk"><Download />Download Android app</a></Button>
      <p className="text-sm">The APK blocks internet access, screenshots and Android cloud backup. That does not make the whole phone airgapped by itself. The browser version is for trying Vault; it does not have the same phone protections. Future updates should be transferred by USB, with your encrypted backups kept current.</p>
    </Step>

    <Step number={4}>
      <ol>
        <li>Open Vault. Choose <strong>Coin QR</strong> to scan the secret QR you want as your unlock key, acknowledge the warning and scan it twice. Or choose a strong, randomly generated password.</li>
        <li>A genuinely random private key is suitable. A public coin address, website link or ordinary text may scan successfully but is <strong>not a secure password</strong>. Anyone with your unlock QR can open a copy of your backup.</li>
        <li>Tap <strong>Add a seed → Make a new one</strong>. Choose <strong>24 words</strong>, then <strong>Make my words</strong>.</li>
        <li>Write the words down in order, away from cameras. Tap <strong>I wrote them down</strong>, answer the word checks, give it a name and tap <strong>Save to vault</strong>.</li>
        <li>Leave the optional extra passphrase empty unless you intentionally want one and can safely preserve it. It creates a different wallet and is not your Vault unlock password.</li>
        <li>For day-to-day convenience, enable fingerprint unlocking in <strong>Settings</strong>. Keep the secret QR or password: fingerprint cannot recover a backup on another phone.</li>
      </ol>
      <p>The newly generated wallet seed and your coin’s unlock key are <strong>two different secrets</strong>. Do not put either into your online wallet or send them to a website. Keep the coin’s secret QR concealed and stored securely—not exposed on a keychain.</p>
      <p><Resource href="https://blockchainmint.com/">Find Cold Storage Coins</Resource></p>
    </Step>

    <Step number={5}>
      <p>Tap <strong>Backup</strong> on the My seeds page. The backup includes seeds, secrets and authenticator accounts, encrypted with the Vault unlock key used when you save it. There is no extra backup password.</p>
      <h3 className="font-semibold text-foreground">Save one file to USB</h3>
      <ol>
        <li>Connect a USB-C drive. Choose <strong>Save file / USB → Save backup file / USB</strong>, then select the drive in Android’s file picker.</li>
        <li>Also choose <strong>Save offline unlocker</strong> and keep that recovery page with the encrypted file. It lets you recover without relying on this app; open it only on a trusted offline device.</li>
      </ol>
      <h3 className="font-semibold text-foreground">Copy to your second offline Pixel</h3>
      <ol>
        <li>Install Vault on the second Pixel, keep it offline, and create or unlock its Vault. Using the same secret QR makes importing easier.</li>
        <li>On the first Pixel, choose <strong>Backup → Send QR → Show encrypted QRs</strong>.</li>
        <li>On the second, choose <strong>Backup → Receive</strong> and scan all the cycling QR frames until complete. Tap <strong>Import into this Vault</strong>, or use fingerprint approval if enabled.</li>
        <li>If the devices use different keys, choose <strong>Different key or older backup?</strong> and supply the sending Vault’s secret QR or password. The receiving phone keeps its own unlock key.</li>
        <li>Confirm the expected entries appeared. Lock the second phone, unlock it again and check it still opens. To test the USB copy, use Receive’s file option to open and import the saved file too.</li>
      </ol>
      <p>Copying adds missing entries and skips duplicates; it does not delete or replace the receiver’s entries. It is <strong>a manual copy, not automatic syncing</strong>. Repeat after changes; USB is faster for larger files.</p>
      <p className="text-sm">Recovery needs the encrypted file <strong>and</strong> its original secret QR or password—not all your backup copies. Keep the key separate from the backups. Changing your Vault key does not change old backups. A cloud copy exposes the file to unlimited offline guessing: use a genuinely strong key, never upload that key or your seed, and retain a separate USB copy.</p>
    </Step>

    <Step number={6}>
      <p>This part happens on <strong>two devices</strong>: offline Vault and your online <Resource href="https://mobile.honest.money/">HME Wallet</Resource>. You are adding a watch-only view, not importing your seed.</p>
      <ol>
        <li>On the offline Pixel, open the seed you created and tap <strong>Show watch-only QR</strong>.</li>
        <li>On your everyday phone, open HME Wallet and use its Vault / watch-only pairing option to scan that pairing QR. Use the pairing code—not the QR that shows your seed words and not your coin’s unlock QR.</li>
        <li>Compare the seed fingerprint shown in Vault with the paired wallet if HME Wallet displays it. Verify the receiving address before sending any funds.</li>
      </ol>
      <p>Watch-only information can reveal addresses and wallet history, but it cannot spend. Share it privately. Your offline Pixel keeps the signing keys.</p>
      <p className="text-sm">HME Wallet’s pairing and offline-payment controls must be available in the version you use. If they are missing, stop: do not work around this by entering your seed. The Vault-side tools are built; the online-wallet connection and real payment round trip still need verification.</p>
    </Step>

    <Step number={7}>
      <p>Once the online wallet supports the full round trip, start with a very small payment. Vault signs; <strong>the online wallet broadcasts</strong>. Signing alone does not send money.</p>
      <ol>
        <li><strong>Online phone:</strong> in the paired watch-only wallet, choose the recipient and amount. Select its unsigned / offline-signing payment option to display the unsigned payment QR.</li>
        <li><strong>Offline Pixel:</strong> tap <strong>Sign a payment</strong>. Select the correct coin or network, then scan the unsigned QR. For cycling codes, keep scanning until all parts are collected.</li>
        <li>Check the network, recipient, amount, change and fee on the offline Pixel. Confirm the recipient independently; do not trust a QR simply because it scans. If anything is wrong or unclear, cancel.</li>
        <li>Approve with your Vault secret QR or password, or tap <strong>Approve with fingerprint</strong> if enabled. Vault signs locally and displays the signed payment QR.</li>
        <li><strong>Online phone:</strong> scan the signed QR using the wallet’s signed-payment import option. Review and broadcast on the same network. Check the transaction ID and wait for confirmation.</li>
      </ol>
      <p>Vault supports Bitcoin-family payments and EVM native/token transfers, not arbitrary contract calls, swaps or sign-in messages. An offline device cannot check balances or current network conditions.</p>
      <Button asChild variant="outline"><Link to="/supported">Supported transaction types<ArrowUpRight /></Link></Button>
    </Step>

    <section className="border-t border-border py-8">
      <h2 className="text-xl font-semibold">Before you trust it with real funds</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-muted-foreground">
        <li>Bootloader relocked; strong screen lock; Pixel kept offline.</li>
        <li>Secret unlock QR and seed copy stored safely, separately from encrypted backups.</li>
        <li>USB recovery and QR copying tested on a second device.</li>
        <li>Complete online → offline → online signing tested, then a small confirmed payment.</li>
      </ul>
      <Button asChild variant="ghost" className="mt-6"><Link to="/"><ArrowLeft />Back to Vault</Link></Button>
    </section>
  </main>;
}