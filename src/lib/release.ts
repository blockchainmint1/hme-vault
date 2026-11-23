/**
 * Published fingerprints for the APK linked in the footer (audit M6).
 * APK_VERSION is the latest version we announce; it may run ahead of the downloadable file
 * while a new APK awaits its build and swap. APK_SHA256 always matches the file actually
 * linked, so update it whenever src/assets/vault-apk.apk.asset.json changes.
 * The next APK's own version lives in package.json and must never be older than APK_VERSION.
 * The signing-certificate fingerprint stays the same for every release signed with Vault's key.
 */
export const APK_VERSION = "1.0.1";
export const APK_SHA256 = "1d36eb4e037df31dc4753e4dbcefac657f4460fef44a5d8039a9c43318fd9de0";
export const SIGNING_CERT_SHA256 =
  "6a7c4e47173911aafc20db541ad23a530b898e87be66e1ab095d529addfd5498";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Compares two dotted version numbers part by part (1.0.10 is newer than 1.0.9). Returns a
 * positive number when `a` is newer, negative when older and 0 when equal.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * APKs up to 0.1.202611230057 carried build stamps `0.1.YYYYMMDDHHMM` (UTC); from 1.0.0 on the
 * version is chosen by hand in package.json. Returns the build day of a legacy stamp in plain
 * words, e.g. "23 Nov 2026", or null for any other version text.
 */
export function versionBuiltOn(version: string): string | null {
  const m = /^\d+\.\d+\.(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(version.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (
    t.getUTCFullYear() !== y ||
    t.getUTCMonth() !== mo - 1 ||
    t.getUTCDate() !== d ||
    h > 23 ||
    mi > 59
  )
    return null;
  return `${d} ${MONTHS[mo - 1]} ${y}`;
}
