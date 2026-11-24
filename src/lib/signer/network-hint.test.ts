import { describe, expect, it } from "vitest";
import { EVM_PICKED_WRONG, PSBT_PICKED_WRONG, wrongNetworkHint } from "./network-hint";

// The HME Wallet USDC request Bobby scanned with TXC picked (2026-11-24).
const USDC =
  '{"format":"hm-evm-tx","v":1,"kind":"erc20-transfer","fp":"27feb4ae","path":"m/44\'/60\'/0\'/0/0","chainId":1,"from":"0x56b26c1a1ac7ffe6ec8267fba58115948dbf9240","to":"0xB051f363258a5108A5EE0a151d3CEdA335A687c2","token":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","amount":"12000000000","nonce":0,"gas":"75708","type":"eip1559","maxFeePerGas":"462881150","maxPriorityFeePerGas":"8903"}';

describe("wrong network hint", () => {
  it("tells the owner to pick EVM when an EVM payment is scanned on TXC", () => {
    expect(wrongNetworkHint(USDC, "TXC")).toBe(EVM_PICKED_WRONG);
  });
  it("covers every non-EVM network, swaps and batch sweeps", () => {
    for (const n of ["ISK", "BTC", "LTC", "DOGE"] as const)
      expect(wrongNetworkHint(USDC, n)).toBe(EVM_PICKED_WRONG);
    expect(wrongNetworkHint('{"format":"hm-thor-swap","v":1}', "BTC")).toBe(EVM_PICKED_WRONG);
    expect(wrongNetworkHint('{"format":"hm-evm-tx","v":1,"kind":"sweep-batch"}', "TXC")).toBe(
      EVM_PICKED_WRONG,
    );
  });
  it("tells the owner to pick the coin when a PSBT is scanned on EVM", () => {
    expect(wrongNetworkHint("cHNidP8BAHECAAAAAQ==", "EVM")).toBe(PSBT_PICKED_WRONG);
    expect(wrongNetworkHint("70736274ff0100", "EVM")).toBe(PSBT_PICKED_WRONG);
  });
  it("stays silent when the network already matches or the code is unknown", () => {
    expect(wrongNetworkHint(USDC, "EVM")).toBeNull();
    expect(wrongNetworkHint("cHNidP8BAHECAAAAAQ==", "TXC")).toBeNull();
    expect(wrongNetworkHint('{"format":"something-else"}', "TXC")).toBeNull();
    expect(wrongNetworkHint("{not json", "TXC")).toBeNull();
  });
});
