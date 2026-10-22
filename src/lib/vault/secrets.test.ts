import { describe, expect, it } from "vitest";
import {
  bytesToBase64,
  base64ToBytes,
  mergeSecrets,
  validateSecret,
  MAX_FILE_BYTES,
  MAX_VAULT_CHARS,
  type SecretEntry,
} from "./secrets";
import { emptyVault, parsePayload } from "./seeds";
import { lockText, unlockText } from "./format";
const secret: SecretEntry = {
  id: "a",
  name: "Android signing key",
  type: "file",
  filename: "release.jks",
  content: bytesToBase64(new Uint8Array([0, 255, 7, 128])),
  createdAt: 1,
};
describe("secret storage", () => {
  it("recovers keystore bytes exactly from an encrypted full-vault backup", async () => {
    const code = await lockText(
      JSON.stringify({ ...emptyVault(), secrets: [secret] }),
      "backup-password",
      1000,
    );
    const payload = parsePayload(await unlockText(code, "backup-password"));
    expect(Array.from(base64ToBytes(payload.secrets[0].content))).toEqual([0, 255, 7, 128]);
    expect(payload.secrets[0].filename).toBe("release.jks");
  });
  it("old seed-only backups still open", () => {
    expect(parsePayload('{"v":1,"kind":"hm-seed-vault","seeds":[]}').secrets).toEqual([]);
  });
  it("merge skips an identical keystore without overwriting a different one", () => {
    const r = mergeSecrets(
      [secret],
      [
        { ...secret, id: "b" },
        { ...secret, content: "AQ==" },
      ],
    );
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.secrets[0].content).toBe(secret.content);
    expect(r.secrets[1].id).not.toBe(secret.id);
  });
  it("rejects files above the 256 KB limit and unsafe filenames", () => {
    expect(() =>
      validateSecret({ ...secret, content: bytesToBase64(new Uint8Array(MAX_FILE_BYTES + 1)) }),
    ).toThrow();
    expect(() => validateSecret({ ...secret, filename: "../release.jks" })).toThrow();
  });
  it("preserves passwords and notes exactly including newlines", () => {
    expect(validateSecret({ ...secret, type: "password", content: " a\nB " }).content).toBe(
      " a\nB ",
    );
  });
  it("validates authenticator entries and normalizes them to otpauth URIs", () => {
    const t = validateSecret({
      id: "t",
      name: "GitHub",
      type: "totp",
      content: "  gezdgnbvgy3tqojqgezdgnbvgy3tqojq  ",
      createdAt: 1,
    });
    expect(t.content).toBe(
      "otpauth://totp/?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=6&period=30",
    );
    expect(() =>
      validateSecret({
        id: "t",
        name: "Bad",
        type: "totp",
        content: "https://example.com",
        createdAt: 1,
      }),
    ).toThrow();
  });
  it("rejects whole-vault plaintext above the 2 MB character limit", () => {
    expect(() => parsePayload(" ".repeat(MAX_VAULT_CHARS + 1))).toThrow("Vault is too large");
  });
});
