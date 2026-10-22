import { describe, expect, it } from "vitest";
import {
  applyIgnoredChecks,
  needsOverride,
  offlineChecklist,
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
  it("ignored rows pass, but only that row", () => {
    const items = offlineChecklist({ ...clean, sim: true, wifi: true });
    const after = applyIgnoredChecks(items, ["sim"]);
    expect(after.find((i) => i.key === "sim")?.ok).toBe(true);
    expect(needsOverride(after)).toBe(true); // wifi still fails
    expect(needsOverride(applyIgnoredChecks(items, ["sim", "wifi"]))).toBe(false);
  });
  it("ignoring a row that already passes changes nothing", () => {
    const items = offlineChecklist(clean);
    expect(applyIgnoredChecks(items, ["sim"])).toEqual(items);
  });
});
