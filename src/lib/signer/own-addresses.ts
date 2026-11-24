/**
 * Display-only ownership labels for EVM recipients: which addresses are this seed's own
 * m/44'/60'/0'/0/i (i = 0…OWN_ADDRESS_MAX_INDEX). Derived from the public-only branch, so no
 * private key is materialised. Never used to refuse or allow a payment.
 */
import { HDKey } from "@scure/bip32";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, getAddress } from "viem";
import { publicKeyToAddress } from "viem/accounts";

export const OWN_ADDRESS_MAX_INDEX = 999;

/**
 * Return each wanted address's own index, or null when it is not one of the first
 * OWN_ADDRESS_MAX_INDEX + 1 addresses. Stops early once every wanted address is found.
 */
export function ownAddressIndexes(root: HDKey, wanted: readonly string[]): (number | null)[] {
  const branch = HDKey.fromExtendedKey(root.derive("m/44'/60'/0'/0").publicExtendedKey);
  const targets = new Map<string, number | null>(wanted.map((a) => [getAddress(a), null]));
  let left = targets.size;
  for (let i = 0; i <= OWN_ADDRESS_MAX_INDEX && left > 0; i++) {
    const point = branch.deriveChild(i).publicKey;
    if (!point) continue;
    const addr = publicKeyToAddress(
      bytesToHex(secp256k1.ProjectivePoint.fromHex(point).toRawBytes(false)),
    );
    if (targets.has(addr) && targets.get(addr) === null) {
      targets.set(addr, i);
      left--;
    }
  }
  return wanted.map((a) => targets.get(getAddress(a)) ?? null);
}
