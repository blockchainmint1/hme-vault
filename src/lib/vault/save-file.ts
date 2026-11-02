import { registerPlugin } from "@capacitor/core";
import { isNative } from "@/lib/native/platform";
const Documents = registerPlugin<{
  save(options: {
    name: string;
    data: string;
    mime: string;
    base64?: boolean;
  }): Promise<{ name: string; bytes?: number }>;
  open(): Promise<{ text?: string }>;
}>("VaultDocuments");

// When Vault opens the system file picker, Android backgrounds the app.
// The Vault provider reads this so that picker doesn't trigger the
// lock-on-hide (the idle limit still applies; see shouldLockOnHide).
let pickerOpenedAt: number | null = null;
export function systemPickerOpenedAt(): number | null {
  return pickerOpenedAt;
}
async function withPicker<T>(fn: () => Promise<T>): Promise<T> {
  pickerOpenedAt = Date.now();
  try {
    return await fn();
  } finally {
    pickerOpenedAt = null;
  }
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type SavedFile = { name: string; bytes: number };
/** Android lets the owner choose a mounted USB drive or local document folder. */
export async function saveTextFile(
  name: string,
  text: string,
  type = "text/plain",
): Promise<SavedFile> {
  if (isNative()) {
    const r = await withPicker(() => Documents.save({ name, data: text, mime: type }));
    return { name: r.name ?? name, bytes: r.bytes ?? 0 };
  }
  const blob = new Blob([text], { type });
  download(name, blob);
  return { name, bytes: blob.size };
}
/** Toast text so a zero-byte or truncated save is visible at a glance. */
export function savedMessage(f: SavedFile): string {
  return `Saved ${f.bytes.toLocaleString("en-US")} bytes to ${f.name}`;
}
export async function saveBinaryFile(name: string, base64: string): Promise<void> {
  if (isNative()) {
    await withPicker(() =>
      Documents.save({ name, data: base64, mime: "application/octet-stream", base64: true }),
    );
    return;
  }
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  download(name, new Blob([bytes], { type: "application/octet-stream" }));
}
export async function openBackupFile(): Promise<string | null> {
  if (isNative()) {
    const result = await withPicker(() => Documents.open());
    return result.text ?? null;
  }
  return withPicker(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".txt,text/plain";
        input.oncancel = () => resolve(null);
        input.onchange = async () => {
          try {
            const file = input.files?.[0];
            if (!file) return resolve(null);
            if (file.size > 3 * 1024 * 1024) throw new Error("Backup must be under 3 MB.");
            resolve(await file.text());
          } catch (e) {
            reject(e);
          }
        };
        input.click();
      }),
  );
}
