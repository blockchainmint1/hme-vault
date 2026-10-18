/**
 * Hardware-bound fingerprint unlock for HME Vault.
 *
 * The vault is always encrypted with the owner's password (or coin words).
 * When fingerprint unlock is on, that unlock secret is sealed by an AES key
 * that lives inside the phone's secure hardware (StrongBox / Titan M2 when
 * present) and can only be used right after a strong fingerprint match. The OS
 * destroys the key if fingerprints are added or the screen lock is removed;
 * the owner then unlocks with the password/coin and re-enables fingerprint.
 * See scripts/native/VaultBiometricKeyPlugin.java.
 *
 * Older builds stored the plaintext password in secure storage; that copy is
 * deleted on first run and fingerprint must be turned on again.
 *
 * On the web all of this is a no-op.
 */
import { registerPlugin } from "@capacitor/core";
import { isNative } from "./platform";
import { combineCoinPassword } from "../vault/coin-unlock";

const BioKey = registerPlugin<{
  status(): Promise<{ available: boolean; enrolled: boolean; strongBox: boolean }>;
  enroll(options: { secret: string }): Promise<{ strongBox: boolean }>;
  unlock(): Promise<{ secret: string }>;
  remove(): Promise<void>;
}>("VaultBiometricKey");


export interface BiometricStatus {
  available: boolean;
  enabled: boolean;
  strongBox?: boolean;
  reason?: string;
}

let cachedFlag: boolean | null = null;
let legacyCleaned = false;

async function cleanLegacy() {
  if (legacyCleaned || !isNative()) return;
  legacyCleaned = true;
  try { localStorage.removeItem("hmsv.bio.enabled"); } catch { /* ignore */ }
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  if (!isNative()) return { available: false, enabled: false };
  await cleanLegacy();
  try {
    const s = await BioKey.status();
    cachedFlag = s.available && s.enrolled;
    return { available: s.available, enabled: cachedFlag, strongBox: s.strongBox };
  } catch {
    cachedFlag = false;
    return { available: false, enabled: false };
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  return (await getBiometricStatus()).available;
}

export function isBiometricEnabled(): boolean {
  return cachedFlag === true;
}

/** Seal an already-verified unlock secret behind the phone's fingerprint hardware. */
export async function enableBiometric(password: string, extraWord = ""): Promise<void> {
  if (!isNative()) throw new Error("Fingerprint unlock is only available in the phone app.");
  await cleanLegacy();
  await BioKey.enroll({ secret: combineCoinPassword(password, extraWord) });
  cachedFlag = true;
}

export async function disableBiometric(): Promise<void> {
  if (isNative()) {
    await cleanLegacy();
    await BioKey.remove().catch(() => undefined);
  }
  cachedFlag = false;
}

/**
 * Ask for a fingerprint and return the unsealed unlock secret.
 * Returns null when cancelled; throws a readable message when the phone
 * invalidated the key (new fingerprint / screen lock removed).
 */
export async function unlockWithBiometric(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { secret } = await BioKey.unlock();
    return secret || null;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "INVALIDATED" || code === "NOT_ENROLLED") {
      cachedFlag = false;
      throw new Error((e as Error).message);
    }
    return null;
  }
}

/**
 * Fingerprint check before a sensitive action. Uses the same hardware key, so
 * it only succeeds when the released credential matches the currently open Vault.
 */
export async function confirmWithBiometric(_reason: string, verify: (credential: string) => boolean): Promise<boolean> {
  if (!isNative() || cachedFlag !== true) return false;
  try {
    const credential = await unlockWithBiometric();
    return credential !== null && verify(credential);
  } catch {
    return false;
  }
}
