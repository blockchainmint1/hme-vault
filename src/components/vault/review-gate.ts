/**
 * Confirmation gate for bulk-payment and sweep reviews.
 *
 * The state remembers which review object it belongs to, so a new review
 * always starts locked without a parent effect. (A parent reset effect runs
 * after the list's own "already fully visible" check and used to re-lock a
 * short list that never scrolls, leaving the owner with no way forward.)
 */
export interface ReviewGate {
  review: object | null;
  seen: boolean;
  ok: boolean;
  extOk: boolean;
}

export const EMPTY_GATE: ReviewGate = { review: null, seen: false, ok: false, extOk: false };

/** The gate as it applies to `review`; any other review starts fully locked. */
export function gateFor(gate: ReviewGate, review: object | null): ReviewGate {
  return gate.review === review ? gate : { ...EMPTY_GATE, review };
}

/** Apply a change for `review`, discarding state left over from another review. */
export function updateGate(
  gate: ReviewGate,
  review: object | null,
  change: Partial<Omit<ReviewGate, "review">>,
): ReviewGate {
  const next = { ...gateFor(gate, review), ...change };
  // Ticking "I checked the list" is impossible before the list was seen.
  if (!next.seen) next.ok = false;
  if (!next.ok) next.extOk = false;
  return next;
}
