/**
 * Multi-part QR framing for payloads too big for one code.
 * Frame: "HMQR:<n>/<total>:<chunk>". A payload that fits is sent as-is.
 */
export const PART_SIZE = 600;

export function toParts(text: string, size = PART_SIZE): string[] {
  if (text.length <= size) return [text];
  const total = Math.ceil(text.length / size);
  return Array.from({ length: total }, (_, i) => `HMQR:${i + 1}/${total}:${text.slice(i * size, (i + 1) * size)}`);
}

export class PartCollector {
  private parts = new Map<number, string>();
  private total = 0;
  /** Feed one scanned code. Returns the whole payload once complete, else null. */
  add(code: string): string | null {
    const m = /^HMQR:(\d+)\/(\d+):([\s\S]*)$/.exec(code);
    if (!m) return code;
    const n = Number(m[1]);
    const total = Number(m[2]);
    if (this.total && total !== this.total) this.parts.clear();
    this.total = total;
    this.parts.set(n, m[3]);
    if (this.parts.size < total) return null;
    return Array.from({ length: total }, (_, i) => this.parts.get(i + 1) ?? "").join("");
  }
  get progress() {
    return { have: this.parts.size, total: this.total };
  }
}
