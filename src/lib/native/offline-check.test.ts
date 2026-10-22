import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyIgnoredChecks,
  canIgnoreCheck,
  needsOverride,
  offlineChecklist,
  readIgnoredChecks,
  setCheckIgnored,
  type RadioStatus,
} from "./offline-check";

const clean: RadioStatus = {
  airplane: true,
  wifi: false,
  mobileData: false,
  bluetooth: false,
  nfc: false,
  sim: false,
  adb: false,
  usbHost: false,
};

describe("offline checklist", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("opens without override when everything is off", () => {
    expect(needsOverride(offlineChecklist(clean))).toBe(false);
  });
  it.each(["wifi", "mobileData", "bluetooth", "nfc", "sim", "adb", "usbHost"] as const)(
    "warns when %s is on",
    (k) => {
      const items = offlineChecklist({ ...clean, [k]: true });
      expect(items.find((i) => i.key === k)?.ok).toBe(false);
      expect(needsOverride(items)).toBe(true);
    },
  );
  it("warns when airplane mode is off", () => {
    const items = offlineChecklist({ ...clean, airplane: false });
    expect(items.find((i) => i.key === "airplane")?.ok).toBe(false);
    expect(needsOverride(items)).toBe(true);
  });
  it("treats an unreadable check as needing override", () => {
    expect(needsOverride(offlineChecklist({ ...clean, bluetooth: null }))).toBe(true);
  });
  it("an all-null status (native plugin error) requires override on every row", () => {
    const items = offlineChecklist({
      airplane: null,
      wifi: null,
      mobileData: null,
      bluetooth: null,
      nfc: null,
      sim: null,
      adb: null,
      usbHost: null,
    });
    expect(items.every((i) => i.ok === null)).toBe(true);
    expect(needsOverride(items)).toBe(true);
  });
  it("ignoring SIM does not bypass Wi-Fi, even with a stored Wi-Fi ignore", () => {
    const items = offlineChecklist({ ...clean, sim: true, wifi: true });
    const after = applyIgnoredChecks(items, ["sim"]);
    expect(after.find((i) => i.key === "sim")?.ok).toBe(true);
    expect(needsOverride(after)).toBe(true); // wifi still fails
    expect(needsOverride(applyIgnoredChecks(items, ["sim", "wifi"]))).toBe(true);
  });
  it.each(["wifi", "mobileData", "bluetooth", "adb", "usbHost", "airplane"] as const)(
    "never permanently ignores failed or unknown %s",
    (key) => {
      expect(canIgnoreCheck(key)).toBe(false);
      for (const value of [key === "airplane" ? false : true, null]) {
        const items = offlineChecklist({ ...clean, [key]: value });
        const after = applyIgnoredChecks(items, [key]);
        expect(after.find((item) => item.key === key)?.ok).toBe(value === null ? null : false);
        expect(needsOverride(after)).toBe(true);
      }
    },
  );
  it.each(["sim", "nfc"] as const)("allows failed and unknown %s to be ignored", (key) => {
    expect(canIgnoreCheck(key)).toBe(true);
    for (const value of [true, null]) {
      const after = applyIgnoredChecks(offlineChecklist({ ...clean, [key]: value }), [key]);
      expect(after.find((item) => item.key === key)?.ok).toBe(true);
      expect(needsOverride(after)).toBe(false);
    }
  });
  it("filters old protected preferences and refuses to save new ones", () => {
    let stored = JSON.stringify(["sim", "nfc", "adb", "usbHost", "wifi", "airplane"]);
    vi.stubGlobal("localStorage", {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; },
    });
    expect(readIgnoredChecks()).toEqual(["sim", "nfc"]);
    expect(setCheckIgnored("adb", true)).toEqual(["sim", "nfc"]);
    expect(setCheckIgnored("usbHost", true)).toEqual(["sim", "nfc"]);
    expect(JSON.parse(stored)).toEqual(["sim", "nfc"]);
    expect(setCheckIgnored("sim", false)).toEqual(["nfc"]);
  });
  it("ignoring a row that already passes changes nothing", () => {
    const items = offlineChecklist(clean);
    expect(applyIgnoredChecks(items, ["sim"])).toEqual(items);
  });
});
