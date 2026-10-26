/** Bitcoin Cash mainnet P2PKH only. CashAddr specification: 160-bit hash, version 0. */
const ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const PREFIX = "bitcoincash";
const GENERATORS = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];

export function encodeCashAddrP2PKH(hash: Uint8Array): string {
  if (hash.length !== 20) throw new Error("CashAddr P2PKH requires a 20-byte hash.");
  const payload: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (const byte of [0, ...hash]) {
    accumulator = ((accumulator << 8) | byte) & 0xfff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      payload.push((accumulator >>> bits) & 31);
    }
  }
  if (bits > 0) payload.push((accumulator << (5 - bits)) & 31);
  let checksum = 1n;
  for (const value of [...Array.from(PREFIX, (c) => c.charCodeAt(0) & 31), 0, ...payload, ...Array<number>(8).fill(0)]) {
    const top = checksum >> 35n;
    checksum = ((checksum & 0x07ffffffffn) << 5n) ^ BigInt(value);
    for (const [i, generator] of GENERATORS.entries()) {
      if ((top & (1n << BigInt(i))) !== 0n) checksum ^= generator;
    }
  }
  checksum ^= 1n;
  const symbols = [...payload];
  for (let i = 7; i >= 0; i--) symbols.push(Number((checksum >> BigInt(5 * i)) & 31n));
  return `${PREFIX}:${symbols.map((value) => ALPHABET[value]).join("")}`;
}