// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { EvmPaymentReview } from "./EvmPaymentReview";
import { reviewEvm } from "@/lib/signer/evm";
import { dummyEvm } from "@/lib/signer/evm.test";

describe("bulk payment review", () => {
  it("lists every recipient and reports when the whole list is visible", async () => {
    const recips = Array.from(
      { length: 10 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "a")}`,
    );
    const r = await reviewEvm(
      JSON.stringify({
        ...dummyEvm,
        kind: "native-disperse",
        to: "0xD152f549545093347A162Dce210e7293f1452150",
        recipients: recips,
        values: recips.map(() => "1000000000000000"),
        value: "10000000000000000",
        gas: "200000",
      }),
      [
        {
          id: "d",
          name: "Dummy",
          words:
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
          fingerprint: "73c5da0a",
        },
      ],
    );
    const end = vi.fn();
    const { getByLabelText } = render(<EvmPaymentReview review={r} onListEnd={end} />);
    expect(getByLabelText("Every recipient and amount").querySelectorAll("li")).toHaveLength(10);
    expect(end).toHaveBeenCalled();
  });
});
