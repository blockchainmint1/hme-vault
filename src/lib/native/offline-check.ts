/**
 * Pre-unlock offline checklist. Android reports radio switches through the local
 * VaultRadioCheck plugin (read-only; the APK still has no INTERNET permission).
 * Owner choice: problems warn, and the owner may override with a confirmation.
 */
import { registerPlugin } from "@capacitor/core";
import { isNative } from "./platform";

export type RadioStatus = {
  airplane: boolean | null;
  wifi: boolean | null;
  bluetooth: boolean | null;
  nfc: boolean | null;
  sim: boolean | null;
  network: boolean | null;
  usb: number | null;
};

export type CheckItem = { key: string; label: string; ok: boolean | null; fix: string };

const Radio = registerPlugin<{ status(): Promise<RadioStatus> }>("VaultRadioCheck");

/** Returns null in the browser, where no check is possible. */
export async function readRadioStatus(): Promise<RadioStatus | null> {
  if (!isNative()) return null;
  try {
    return await Radio.status();
  } catch {
    return null;
  }
}

const off = (v: boolean | null) => (v === null ? null : !v);

/** Pure: turns raw status into the checklist. `ok: null` means Android would not say. */
export function offlineChecklist(s: RadioStatus): CheckItem[] {
  return [
    {
      key: "network",
      label: "No network connection",
      ok: off(s.network),
      fix: "Disconnect every network",
    },
    { key: "wifi", label: "Wi-Fi off", ok: off(s.wifi), fix: "Turn Wi-Fi off" },
    { key: "bluetooth", label: "Bluetooth off", ok: off(s.bluetooth), fix: "Turn Bluetooth off" },
    { key: "nfc", label: "NFC off", ok: off(s.nfc), fix: "Turn NFC off" },
    { key: "sim", label: "No SIM card", ok: off(s.sim), fix: "Remove the SIM card" },
    {
      key: "usb",
      label: "No USB devices",
      ok: s.usb === null ? null : s.usb === 0,
      fix: "Unplug USB devices",
    },
  ];
}

/** True when any check failed or could not be read. */
export function needsOverride(items: CheckItem[]): boolean {
  return items.some((i) => i.ok !== true);
}
