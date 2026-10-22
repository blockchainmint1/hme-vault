/** Bundled into one downloadable offline HTML; never requests a remote resource. */
import QRCode from "qrcode";
import { lockTypedText } from "./format";
import { bytesToBase64, MAX_FILE_BYTES, validateSecret } from "./secrets";
import { toParts } from "../signer/qr-parts";
const find = (id: string) => document.getElementById(id);
let timer: ReturnType<typeof setInterval> | undefined;
let frames: string[] = [];
let index = 0;
let encrypted = "";
const input = (id: string) => { const el = find(id); return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? el.value : ""; };
async function show() {
  const canvas = find("qr");
  if (!(canvas instanceof HTMLCanvasElement) || !frames.length) return;
  await QRCode.toCanvas(canvas, frames[index], { width: 360, margin: 2, errorCorrectionLevel: "M" });
  const progress = find("progress"); if (progress) progress.textContent = `Part ${index + 1} of ${frames.length}`;
}
function clearSource() {
  for (const id of ["content", "pw", "pw2", "file"]) { const el = find(id); if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = ""; }
}
document.addEventListener("visibilitychange", () => { if (document.hidden) clearSource(); });
find("go")?.addEventListener("click", async () => {
  const status = find("status"); const go = find("go"); if (!(go instanceof HTMLButtonElement) || !status) return;
  go.disabled = true; status.textContent = "Encrypting…";
  clearInterval(timer); frames = []; encrypted = ""; const result = find("result"); if (result) result.hidden = true;
  try {
    const type = input("type"); let content = input("content"); let filename: string | undefined;
    if (input("pw") !== input("pw2")) throw new Error("Passwords don't match.");
    if (type === "file") {
      const el = find("file"); const file = el instanceof HTMLInputElement ? el.files?.[0] : undefined;
      if (!file) throw new Error("Choose a file first.");
      if (file.size > MAX_FILE_BYTES) throw new Error("File must be 256 KB or smaller.");
      filename = file.name; content = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    }
    if (!content) throw new Error("Enter a secret or choose a non-empty file.");
    const secret = validateSecret({ id: crypto.randomUUID(), name: input("name"), type, content, filename, createdAt: Date.now() });
    encrypted = await lockTypedText(JSON.stringify({ v: 1, kind: "hm-seed-vault", seeds: [], secrets: [secret] }), input("pw"));
    clearSource();
    frames = toParts(encrypted); index = 0; await show();
    if (result) result.hidden = false;
    if (frames.length > 1) timer = setInterval(() => { index = (index + 1) % frames.length; void show(); }, 700);
    status.textContent = "Encrypted. Scan into Vault → Secrets → Import.";
  } catch(e) { status.textContent = (e as Error).message; } finally { go.disabled = false; }
});
find("type")?.addEventListener("change", () => {
  const file = find("file-row"), text = find("text-row"); if (file && text) { file.hidden = input("type") !== "file"; text.hidden = input("type") === "file"; }
});
find("pause")?.addEventListener("click", () => { clearInterval(timer); timer = undefined; });
find("next")?.addEventListener("click", () => { clearInterval(timer); index = (index + 1) % Math.max(1, frames.length); void show(); });
find("save")?.addEventListener("click", () => {
  if (!encrypted) return;
  const url = URL.createObjectURL(new Blob([encrypted + "\n"], { type: "text/plain" }));
  const a = document.createElement("a"); a.href = url; a.download = "vault-secret-transfer.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});