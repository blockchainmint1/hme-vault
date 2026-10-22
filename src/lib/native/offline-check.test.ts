import { describe, expect, it } from "vitest";
import { needsOverride, offlineChecklist, type RadioStatus } from "./offline-check";

const clean: RadioStatus = {
  airplane: true,
  wifi: false,
  bluetooth: false,
  nfc: false,
  sim: false,
  network: false,
  usb: 0,
};

describe("offline checklist", () => {
  it("opens without override when everything is off", () => {
    expect(needsOverride(offlineChecklist(clean))).toBe(false);
  });
  it.each(["wifi", "bluetooth", "nfc", "sim", "network"] as const)("warns when %s is on", (k) => {
    const items = offlineChecklist({ ...clean, [k]: true });
    expect(items.find((i) => i.key === k)?.ok).toBe(false);
    expect(needsOverride(items)).toBe(true);
  });
  it("warns when a USB device is plugged in", () => {
    expect(needsOverride(offlineChecklist({ ...clean, usb: 1 }))).toBe(true);
  });
  it("treats an unreadable check as needing override", () => {
    expect(needsOverride(offlineChecklist({ ...clean, bluetooth: null }))).toBe(true);
  });
});
