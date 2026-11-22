/**
 * The signed answer's signature must be recoverable the way SEEDS recovers it:
 * Bitcoin-style compact form, header 31 + recovery, over the double-SHA256 of
 * the length-prefixed message. A wrong header or encoding hands SEEDS a
 * different identity than the one Vault showed the owner.
 */
import { describe, expect, it } from "vitest";
import { base64, createBase58check } from "@scure/base";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { coinIdentityKey, signTxcMessage } from "@/lib/key-signin/seeds-key-reference";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const IDENTITY = "TZZCuca5ntPVCJL5ryTjh465Jvw5vHxsVd";
const b58c = createBase58check(sha256);

function varint(n: number): Uint8Array {
  return n < 0xfd ? Uint8Array.of(n) : Uint8Array.of(0xfd, n & 0xff, n >> 8);
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function messageHash(message: string): Uint8Array {
  const p = new TextEncoder().encode("Bitcoin Signed Message:\n");
  const m = new TextEncoder().encode(message);
  return sha256(sha256(concat(varint(p.length), p, varint(m.length), m)));
}

/** What SEEDS does with the signature Vault returns: recover the signer's address. */
function recoverAddress(message: string, signature: string): string {
  const raw = base64.decode(signature);
  expect(raw.length).toBe(65);
  const header = raw[0]!;
  expect(header >= 31 && header <= 34).toBe(true); // compressed-key headers only
  // noble's recovered form is recovery ‖ r ‖ s; Bitcoin's is header ‖ r ‖ s,
  // and the header is 31 + recovery for a compressed key.
  const recovered = concat(Uint8Array.of(header - 31), raw.slice(1));
  const point = secp256k1.Signature.fromBytes(recovered, "recovered").recoverPublicKey(
    messageHash(message),
  );
  return b58c.encode(concat(Uint8Array.of(66), ripemd160(sha256(point.toBytes(true)))));
}

describe("coin message signature is recoverable by SEEDS", () => {
  it("recovers the same identity address Vault displays", () => {
    const key = coinIdentityKey(PHRASE);
    const { address, signature } = signTxcMessage(key, "x");
    key.fill(0);
    expect(address).toBe(IDENTITY);
    expect(recoverAddress("x", signature)).toBe(IDENTITY);
  });

  it("a different message recovers a different identity, never this one", () => {
    const key = coinIdentityKey(PHRASE);
    const { signature } = signTxcMessage(key, "pocket 1106 handed over");
    key.fill(0);
    expect(recoverAddress("pocket 1106 handed over", signature)).toBe(IDENTITY);
    expect(recoverAddress("x", signature)).not.toBe(IDENTITY);
  });

  it("a tampered signature does not recover this identity", () => {
    const key = coinIdentityKey(PHRASE);
    const { signature } = signTxcMessage(key, "x");
    key.fill(0);
    const raw = base64.decode(signature);
    raw[64] = raw[64]! ^ 0x01; // flip one bit of s
    const broken = base64.encode(raw);
    let recovered = "";
    try {
      recovered = recoverAddress("x", broken);
    } catch {
      recovered = "";
    }
    expect(recovered).not.toBe(IDENTITY);
  });
});
