import { isAddress } from "viem";
import { z } from "zod";

export const ZERO_EVM_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Lowercase is accepted; mixed-case addresses must have a valid EIP-55 checksum. */
export function isValidEvmAddress(value: string): boolean {
  return isAddress(value, { strict: true }) && value.toLowerCase() !== ZERO_EVM_ADDRESS;
}

/** Shared by ordinary payments, bulk payments and swap requests. */
export const evmAddress = z
  .string()
  .refine(isValidEvmAddress, "Invalid, zero, or badly checksummed address.");
