import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PartCollector } from "@/lib/signer/qr-parts";
import { PartDots } from "./PartDots";

function dotCount(html: string) {
  return (html.match(/title="Part /g) ?? []).length;
}

describe("PartDots", () => {
  it("renders one dot per part for a small transfer and names the missing ones", () => {
    const html = renderToStaticMarkup(<PartDots total={4} received={[1, 3]} />);
    expect(dotCount(html)).toBe(4);
    expect(html).toContain("Still missing: 2, 4");
    expect(html).not.toContain('role="progressbar"');
  });

  it("renders no per-part dots when a collector claims the maximum part count", () => {
    const collector = new PartCollector();
    expect(collector.add("HMQR2:00000000:1/13108:xxxx")).toBeNull();
    const { total, received } = collector.progress;
    expect(total).toBe(13108);
    const html = renderToStaticMarkup(<PartDots total={total} received={received} />);
    expect(dotCount(html)).toBe(0);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("1 of 13108 parts");
    expect(html).not.toContain("Still missing");
  });

  it("keeps listing missing numbers once a large transfer is nearly complete", () => {
    const html = renderToStaticMarkup(
      <PartDots total={13108} received={Array.from({ length: 13105 }, (_, i) => i + 1)} />,
    );
    expect(dotCount(html)).toBe(0);
    expect(html).toContain("Still missing: 13106, 13107, 13108");
    expect(html).toContain("13105 of 13108 parts");
  });
});
