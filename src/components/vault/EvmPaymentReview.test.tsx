import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EvmPaymentReview } from "./EvmPaymentReview";
import { reviewEvm } from "@/lib/signer/evm";
import { dummyEvm } from "@/lib/signer/evm.test";

describe("bulk payment review", () => {
  it("lists every recipient and shows every address", async () => {
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
    const html = renderToStaticMarkup(<EvmPaymentReview review={r} />);
    expect((html.match(/<li/g) ?? []).length).toBe(10);
    for (const a of recips) expect(html.toLowerCase()).toContain(a);
    const warning = "If any recipient cannot receive, the whole payment fails and nothing is sent.";
    expect(html).toContain(warning);
    expect(html.indexOf(warning)).toBeLessThan(html.indexOf("<ol"));
  });

  const review = (labels: (number | null)[]) =>
    ({
      request: { ...dummyEvm, to: "0xD152f549545093347A162Dce210e7293f1452150" },
      seedName: "Dummy",
      chainName: "Ethereum",
      symbol: "ETH",
      amountLabel: "0.003 ETH",
      feeLabel: "0.001 ETH",
      totalLabel: "0.004 ETH",
      warnings: [],
      payouts: labels.map((ownIndex, i) => ({
        address: `0x${(i + 1).toString(16).padStart(40, "a")}`,
        amountLabel: "0.001 ETH",
        ownIndex,
      })),
    }) as unknown as Parameters<typeof EvmPaymentReview>[0]["review"];

  it("labels an all-own list with each index and no stranger warning", () => {
    const html = renderToStaticMarkup(<EvmPaymentReview review={review([1, 57, 999])} />);
    for (const i of [1, 57, 999]) expect(html).toContain(`Your own address #${i}<`);
    expect(html).toContain("3 of 3 recipients are your own addresses");
    expect(html).not.toContain("someone else");
    expect(html).not.toContain("Not one of your addresses");
  });

  it("shows strangers in red with correct counts above the list", () => {
    const html = renderToStaticMarkup(<EvmPaymentReview review={review([4, null, 9, null])} />);
    expect(html).toContain("2 of 4 recipients are your own addresses");
    expect(html).toContain("2 recipients are someone else.");
    expect(html.indexOf("someone else")).toBeLessThan(html.indexOf("<ol"));
    expect((html.match(/Not one of your addresses/g) ?? []).length).toBe(2);
    expect(html).toMatch(/text-destructive">0xa{39}2</);
  });

  it("uses the singular for one stranger", () => {
    const html = renderToStaticMarkup(<EvmPaymentReview review={review([0, null])} />);
    expect(html).toContain("1 recipient is someone else.");
  });
});
