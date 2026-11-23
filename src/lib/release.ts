/**
 * Published fingerprints for the APK linked in the footer (audit M6).
 * Update APK_SHA256 whenever src/assets/vault-apk.apk.asset.json changes.
 * The signing-certificate fingerprint stays the same for every release signed with Vault's key.
 */
export const APK_VERSION = "0.1.202611191758";
export const APK_SHA256 = "d2be204b9c4d721e2596bf5162b80d9aef64e3718cf74d13b4d1591dfef9de79";
export const SIGNING_CERT_SHA256 =
  "6a7c4e47173911aafc20db541ad23a530b898e87be66e1ab095d529addfd5498";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * APK versions are stamped by the build as `0.1.YYYYMMDDHHMM` (UTC). Returns the build day in
 * plain words, e.g. "23 Nov 2026", or null for any other version text.
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
