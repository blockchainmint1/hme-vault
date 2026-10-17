import { expect, it } from "vitest";
import { PartCollector, toParts } from "./qr-parts";
it("collects cycling encrypted transfer parts in any order with repeats", () => {
  const text = "HMVAULT1." + "xyz".repeat(1500); const parts = toParts(text); const c = new PartCollector();
  expect(c.add(parts[2])).toBe(null); expect(c.add(parts[2])).toBe(null);
  let full: string | null = null; for (const p of [...parts].reverse()) full = c.add(p);
  expect(full).toBe(text);
});
it("rejects mixed transfers and invalid part indices", () => {
  const c = new PartCollector(); c.add(toParts("a".repeat(1200))[0]);
  expect(() => c.add(toParts("b".repeat(1200))[1])).toThrow();
  expect(() => new PartCollector().add("HMQR:0/2:x")).toThrow();
  expect(() => new PartCollector().add("HMQR:1/999999999:x")).toThrow();
});
it("keeps legacy multi-part codes readable", () => {
  const c = new PartCollector(); expect(c.add("HMQR:2/2:world")).toBe(null); expect(c.add("HMQR:1/2:hello ")).toBe("hello world");
});