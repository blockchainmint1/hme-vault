import { expect, it } from "vitest";
import { PAIRING_PART_SIZE, SIGNING_PART_SIZE, PartCollector, toParts } from "./qr-parts";
import { readFileSync } from "node:fs";

it("limits signed-payment chunks to 240 characters and reconstructs exact signed bytes", () => {
  const hex = readFileSync(
    new URL("./fixtures/txc-multisend.signed.txt", import.meta.url),
    "utf8",
  ).trim();
  expect(SIGNING_PART_SIZE).toBe(240);
  const parts = toParts(hex, SIGNING_PART_SIZE);
  expect(parts).toHaveLength(Math.ceil(hex.length / 240));
  for (const part of parts) {
    const chunk = /^HMQR2:[a-f0-9]{8}:\d+\/\d+:([\s\S]*)$/.exec(part)?.[1];
    expect(chunk).toBeDefined();
    expect(chunk?.length).toBeLessThanOrEqual(240);
  }
  const collector = new PartCollector();
  let result: string | null = null;
  for (const part of [...parts].reverse()) result = collector.add(part);
  expect(result).toBe(hex);
});
it("collects cycling encrypted transfer parts in any order with repeats", () => {
  const text = "HMVAULT1." + "xyz".repeat(1500);
  const parts = toParts(text);
  const c = new PartCollector();
  expect(c.add(parts[2])).toBe(null);
  expect(c.add(parts[2])).toBe(null);
  let full: string | null = null;
  for (const p of [...parts].reverse()) full = c.add(p);
  expect(full).toBe(text);
});
it("rejects mixed transfers and invalid part indices", () => {
  const c = new PartCollector();
  c.add(toParts("a".repeat(1200))[0]);
  expect(() => c.add(toParts("b".repeat(1200))[1])).toThrow();
  expect(() => new PartCollector().add("HMQR:0/2:x")).toThrow();
  expect(() => new PartCollector().add("HMQR:1/999999999:x")).toThrow();
});
it("keeps legacy multi-part codes readable", () => {
  const c = new PartCollector();
  expect(c.add("HMQR:2/2:world")).toBe(null);
  expect(c.add("HMQR:1/2:hello ")).toBe("hello world");
});
it("uses 240-character pairing chunks and preserves the exact payload with repeats and reversed order", () => {
  const text = JSON.stringify({ hmvault: 1, fp: "73c5da0a", keys: "xpub".repeat(700) });
  const parts = toParts(text, PAIRING_PART_SIZE);
  expect(PAIRING_PART_SIZE).toBe(240);
  expect(parts).toHaveLength(Math.ceil(text.length / 240));
  expect(parts.length).toBeGreaterThan(toParts(text).length);
  for (const part of parts) {
    const chunk = /^HMQR2:[a-f0-9]{8}:\d+\/\d+:([\s\S]*)$/.exec(part)?.[1];
    expect(chunk?.length).toBeLessThanOrEqual(240);
  }
  const collector = new PartCollector();
  expect(collector.add(parts[0])).toBeNull();
  expect(collector.add(parts[0])).toBeNull();
  let result: string | null = null;
  for (const part of [...parts].reverse()) result = collector.add(part);
  expect(result).toBe(text);
});
it("keeps default transfers at 600 characters and short codes unframed", () => {
  expect(toParts("a".repeat(1201))).toHaveLength(3);
  expect(toParts("a".repeat(240), 240)).toEqual(["a".repeat(240)]);
  expect(toParts("a".repeat(241), 240)).toHaveLength(2);
  expect(() => toParts("x", 239)).toThrow();
});
it("verifies content labels independently of custom chunk size, including short assembled payloads", () => {
  for (const size of [240, 600, 2000]) {
    const text = "x".repeat(size + 1);
    const collector = new PartCollector();
    let result: string | null = null;
    for (const part of toParts(text, size)) result = collector.add(part);
    expect(result).toBe(text);
  }
});
it("rejects damaged and mixed webcam-friendly transfers", () => {
  const parts = toParts("a".repeat(700), 240);
  const damaged = new PartCollector();
  damaged.add(parts[0].replace(/a$/, "b"));
  damaged.add(parts[1]);
  expect(() => damaged.add(parts[2])).toThrow("damaged");
  const mixed = new PartCollector();
  mixed.add(parts[0]);
  expect(() => mixed.add(toParts("b".repeat(700), 240)[1])).toThrow("Different transfer");
});

for (const prefix of ["HMQR2:12345678", "HMQR"]) {
  it(`bounds stored ${prefix} chunks at 3 MiB before completion without counting repeats`, () => {
    const limit = 3 * 1024 * 1024;
    const collector = new PartCollector();
    const total = 2000;
    const chunk = "x".repeat(2000);
    const fullChunks = Math.floor(limit / chunk.length);
    for (let n = 1; n <= fullChunks; n++) {
      const frame = `${prefix}:${n}/${total}:${chunk}`;
      expect(collector.add(frame)).toBeNull();
      expect(collector.add(frame)).toBeNull();
    }
    const last = `${prefix}:${fullChunks + 1}/${total}:${"x".repeat(limit % 2000)}`;
    expect(collector.add(last)).toBeNull();
    expect(collector.add(last)).toBeNull();
    expect(collector.progress).toEqual({ have: fullChunks + 1, total });
    expect(() => collector.add(`${prefix}:${fullChunks + 2}/${total}:x`)).toThrow(
      "Transfer is too large.",
    );
    expect(collector.progress).toEqual({ have: fullChunks + 1, total });
    expect(() => collector.add(last.replace(/x$/, "y"))).toThrow("Conflicting QR part");
  });
}
