/**
 * Pre-unlock offline checklist. Android reports radio and plug state through the
 * local VaultRadioCheck plugin, which reads only permission-free Settings.Global
 * values and the battery intent (the APK ships with zero network permissions).
 * Owner choice: problems warn, and the owner may override with a confirmation,
 * or permanently ignore SIM/NFC only (stored in localStorage, non-secret).
 */
import { registerPlugin } from "@capacitor/core";
import { isNative } from "./platform";

export type RadioStatus = {
  airplane: boolean | null;
  wifi: boolean | null;
  mobileData: boolean | null;
  bluetooth: boolean | null;
  nfc: boolean | null;
  sim: boolean | null;
  adb: boolean | null;
  usbHost: boolean | null;
};

export type CheckItem = { key: string; label: string; ok: boolean | null; fix: string };

const Radio = registerPlugin<{ status(): Promise<RadioStatus> }>("VaultRadioCheck");

const ALL_UNKNOWN: RadioStatus = {
  airplane: null,
  wifi: null,
  mobileData: null,
  bluetooth: null,
  nfc: null,
  sim: null,
  adb: null,
  usbHost: null,
};

/**
 * Returns null only in the browser, where no check is possible. On native, a
 * plugin error returns an all-null status so every row says "couldn't check"
 * and the owner override is required — the checklist never fails open.
 */
export async function readRadioStatus(): Promise<RadioStatus | null> {
  if (!isNative()) return null;
  try {
    return await Radio.status();
  } catch {
    return { ...ALL_UNKNOWN };
  }
}

const off = (v: boolean | null) => (v === null ? null : !v);

/** Pure: turns raw status into the checklist. `ok: null` means Android would not say. */
export function offlineChecklist(s: RadioStatus): CheckItem[] {
  return [
    {
      key: "airplane",
      label: "Airplane mode on",
      ok: s.airplane,
      fix: "Turn airplane mode on",
    },
    { key: "wifi", label: "Wi-Fi off", ok: off(s.wifi), fix: "Turn Wi-Fi off" },
    {
      key: "mobileData",
      label: "Mobile data off",
      ok: off(s.mobileData),
      fix: "Turn mobile data off",
    },
    { key: "bluetooth", label: "Bluetooth off", ok: off(s.bluetooth), fix: "Turn Bluetooth off" },
    { key: "nfc", label: "NFC off", ok: off(s.nfc), fix: "Turn NFC off" },
    { key: "sim", label: "No SIM card", ok: off(s.sim), fix: "Remove the SIM card / eSIM profile" },
    {
      key: "adb",
      label: "USB debugging off",
      ok: off(s.adb),
      fix: "Turn USB debugging off in Developer options",
    },
    {
      key: "usbHost",
      label: "Not connected to a computer",
      ok: off(s.usbHost),
      fix: "Unplug the USB cable from the computer",
    },
  ];
}

/** True when any check failed or could not be read. */
export function needsOverride(items: CheckItem[]): boolean {
  return items.some((i) => i.ok !== true);
}

const IGNORE_KEY = "vault-offline-ignore";

/** Protected rows cannot be bypassed by old stored preferences or direct calls. */
export function canIgnoreCheck(key: string): boolean {
  return key === "sim" || key === "nfc";
}

/** Permitted rows the owner has chosen to always ignore. Non-secret. */
export function readIgnoredChecks(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(IGNORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === "string" && canIgnoreCheck(k))
      : [];
  } catch {
    return [];
  }
}

export function setCheckIgnored(key: string, ignored: boolean): string[] {
  const next = new Set(readIgnoredChecks());
  if (ignored && canIgnoreCheck(key)) next.add(key);
  else next.delete(key);
  try {
    globalThis.localStorage?.setItem(IGNORE_KEY, JSON.stringify([...next]));
  } catch {
    // storage unavailable; ignore list simply won't persist
  }
  return [...next];
}

/** Checklist with ignored rows marked as passing. */
export function applyIgnoredChecks(items: CheckItem[], ignored: string[]): CheckItem[] {
  const set = new Set(ignored.filter(canIgnoreCheck));
  return items.map((i) => (set.has(i.key) && i.ok !== true ? { ...i, ok: true as const } : i));
}
