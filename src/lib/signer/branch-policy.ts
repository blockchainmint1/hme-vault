/**
 * Export policy for "Share a trading pocket". Pure checks, no derivation.
 *
 * Vault only ever hands over hardened account-level nodes (or the hardened leaf
 * for SLIP-0010 coins). Hardened derivation is what stops a shared key from
 * revealing its parent, its siblings or the savings branch, so every rule here
 * is about keeping the exported node at or below a hardened, non-zero account.
 */

/** What a service profile may ever ask for. Static, reviewed and compiled in. */
export interface BranchPolicy {
  /** Account (pocket) numbers this service may receive. Never 0. */
  readonly pockets: readonly number[];
  /** The exact, ordered path list of the contract version. Requests must match it. */
  readonly paths: readonly string[];
}

const HARDENED_LIMIT = 0x80000000;
const REFUSED = "That request asks for keys Vault never hands over.";

/** Parse `m/a'/b'/c'...` where every component is hardened. Anything else throws. */
export function parseHardenedPath(path: string): number[] {
  if (typeof path !== "string" || path.length > 64) throw new Error(REFUSED);
  const parts = path.split("/");
  if (parts[0] !== "m" || parts.length < 2) throw new Error(REFUSED);
  return parts.slice(1).map((part) => {
    const m = /^(0|[1-9]\d{0,9})'$/.exec(part);
    if (!m) throw new Error(REFUSED);
    const n = Number(m[1]);
    if (n >= HARDENED_LIMIT) throw new Error(REFUSED);
    return n;
  });
}

/**
 * One node is exportable only if it is fully hardened, at depth 3 or deeper,
 * and its account (third component) is a non-zero pocket the policy allows.
 */
export function assertExportableNode(path: string, pockets: readonly number[]): void {
  const parts = parseHardenedPath(path);
  if (parts.length < 3) throw new Error(REFUSED);
  const account = parts[2]!;
  if (account === 0 || !pockets.includes(account)) throw new Error(REFUSED);
}

/** No duplicates, and no path may be an ancestor of another in the same scope. */
export function assertNoAncestors(paths: readonly string[]): void {
  const parsed = paths.map(parseHardenedPath);
  for (let i = 0; i < parsed.length; i++) {
    for (let j = 0; j < parsed.length; j++) {
      if (i === j) continue;
      const a = parsed[i]!;
      const b = parsed[j]!;
      if (a.length <= b.length && a.every((n, k) => n === b[k])) throw new Error(REFUSED);
    }
  }
}

/** A profile's own policy must pass the same rules before Vault will load it. */
export function assertPolicySound(policy: BranchPolicy): void {
  if (policy.pockets.length === 0 || policy.paths.length === 0) throw new Error(REFUSED);
  if (policy.pockets.some((p) => !Number.isInteger(p) || p <= 0 || p >= HARDENED_LIMIT))
    throw new Error(REFUSED);
  for (const path of policy.paths) assertExportableNode(path, policy.pockets);
  assertNoAncestors(policy.paths);
}

/**
 * Scope is settled before the owner sees the approval screen: the request must
 * name the policy's exact list for an allowed pocket. No widening, and no
 * partial approval, because the receiver signed for the whole list.
 */
export function assertScopeWithinPolicy(
  requested: readonly string[],
  pocket: number,
  policy: BranchPolicy,
): void {
  if (!policy.pockets.includes(pocket)) throw new Error(REFUSED);
  if (
    !Array.isArray(requested) ||
    requested.length !== policy.paths.length ||
    requested.some((path, i) => path !== policy.paths[i])
  )
    throw new Error(REFUSED);
  for (const path of requested) {
    assertExportableNode(path, [pocket]);
  }
  assertNoAncestors(requested);
}
