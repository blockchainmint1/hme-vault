import { describe, expect, it } from "vitest";
import { base32ToBytes, parseOtpAuth, secondsRemaining, toOtpAuthUri, totpCode } from "./totp";

// RFC 6238 test key: ASCII "12345678901234567890" as base32.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("base32", () => {
  it("decodes the RFC 6238 key", () => {
    expect(new TextDecoder().decode(base32ToBytes(RFC_SECRET))).toBe("12345678901234567890");
  });
  it("rejects invalid characters", () => {
    expect(() => base32ToBytes("not-valid!")).toThrow();
  });
});

describe("parseOtpAuth", () => {
  it("parses a full otpauth URI", () => {
    const p = parseOtpAuth(`otpauth://totp/Example:alice@example.com?secret=${RFC_SECRET}&issuer=Example&digits=6&period=30`);
    expect(p).toMatchObject({ label: "Example:alice@example.com", issuer: "Example", secret: RFC_SECRET, digits: 6, period: 30 });
  });
  it("accepts a bare base32 secret with defaults", () => {
    const p = parseOtpAuth(`  ${RFC_SECRET.toLowerCase()}  `);
    expect(p).toMatchObject({ secret: RFC_SECRET, digits: 6, period: 30 });
  });
  it("rejects hotp, short secrets and junk", () => {
    expect(() => parseOtpAuth(`otpauth://hotp/x?secret=${RFC_SECRET}`)).toThrow();
    expect(() => parseOtpAuth("otpauth://totp/x?secret=AAAA")).toThrow();
    expect(() => parseOtpAuth("https://example.com")).toThrow();
  });
  it("round-trips through toOtpAuthUri", () => {
    const p = parseOtpAuth(`otpauth://totp/Site:bob?secret=${RFC_SECRET}&issuer=Site`);
    expect(parseOtpAuth(toOtpAuthUri(p))).toEqual(p);
  });
});

describe("totpCode (RFC 6238 vectors, 8 digits)", () => {
  const p = { label: "", issuer: "", secret: RFC_SECRET, digits: 8, period: 30 };
  it.each([
    [59_000, "94287082"],
    [1_111_111_109_000, "07081804"],
    [1_234_567_890_000, "89005924"],
  ])("at %i ms -> %s", async (ms, code) => {
    expect(await totpCode(p, ms)).toBe(code);
  });
  it("produces 6-digit codes by default", async () => {
    const code = await totpCode({ ...p, digits: 6 }, 59_000);
    expect(code).toMatch(/^\d{6}$/);
  });
});

describe("secondsRemaining", () => {
  it("counts down within the period", () => {
    expect(secondsRemaining({ label: "", issuer: "", secret: RFC_SECRET, digits: 6, period: 30 }, 59_000)).toBe(1);
    expect(secondsRemaining({ label: "", issuer: "", secret: RFC_SECRET, digits: 6, period: 30 }, 60_000)).toBe(30);
  });
});


it("refuses non-SHA1 authenticator accounts", () => {
  expect(() => parseOtpAuth("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256")).toThrow(/SHA256/);
});
