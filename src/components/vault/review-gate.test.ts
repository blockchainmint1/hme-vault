import { describe, expect, it } from "vitest";
import { EMPTY_GATE, gateFor, updateGate } from "./review-gate";

describe("bulk review confirmation gate", () => {
  it("stays unlocked when a short list reports it is fully visible on first show", () => {
    const review = {};
    // The list's mount check fires before anything else touches the gate.
    const g = updateGate(EMPTY_GATE, review, { seen: true });
    expect(gateFor(g, review).seen).toBe(true);
  });

  it("starts a new review locked, even after the previous one was confirmed", () => {
    const a = {};
    const b = {};
    let g = updateGate(EMPTY_GATE, a, { seen: true });
    g = updateGate(g, a, { ok: true, extOk: true });
    const next = gateFor(g, b);
    expect(next).toEqual({ review: b, seen: false, ok: false, extOk: false });
  });

  it("cannot be ticked before the list was seen", () => {
    const review = {};
    const g = updateGate(EMPTY_GATE, review, { ok: true, extOk: true });
    expect(g.ok).toBe(false);
    expect(g.extOk).toBe(false);
  });
});
