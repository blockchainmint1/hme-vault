import { describe, expect, it } from "vitest";
import { wordsFromScan } from "./scan-seed";

describe("wordsFromScan", () => {
  it("reads a Standard SeedQR", () => {
    expect(wordsFromScan("0000".repeat(11) + "0003")).toBe("abandon ".repeat(11) + "about");
  });
  it("reads plain words", () => {
    expect(wordsFromScan(" Abandon,  ABOUT\n")).toBe("abandon about");
  });
});
