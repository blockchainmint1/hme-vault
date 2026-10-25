/** TXC Send To Many v0/type 7: one canonical push, TSD property 39, explicit vout mapping. */
export const MAX_OMNI_RECEIVERS = 7;
export interface OmniReceiver {
  vout: number;
  amount: bigint;
}
export function decodeOmniSendToMany(script: Uint8Array): OmniReceiver[] | null {
  if (script[0] !== 0x6a) return null;
  const size = script[1] === 0x4c ? script[2] : script[1];
  const offset = script[1] === 0x4c ? 3 : 2;
  if (size === undefined || size < 22 || size > 76 || script.length !== offset + size)
    return null;
  if ((size < 76 && offset !== 2) || (size === 76 && offset !== 3)) return null;
  const payload = script.subarray(offset);
  const header = [0x6f, 0x6d, 0x6e, 0x69, 0, 0, 0, 7, 0, 0, 0, 39];
  if (header.some((byte, i) => payload[i] !== byte)) return null;
  const count = payload[12];
  if (!count || count > MAX_OMNI_RECEIVERS || size !== 13 + count * 9) return null;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const receivers: OmniReceiver[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < count; i++) {
    const start = 13 + i * 9;
    const vout = payload[start];
    const amount = view.getBigUint64(start + 1, false);
    if (seen.has(vout) || amount === 0n) return null;
    seen.add(vout);
    receivers.push({ vout, amount });
  }
  return receivers;
}