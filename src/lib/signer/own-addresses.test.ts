import { describe, expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { parseTransaction, type TransactionSerialized } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { reviewEvm, signEvm } from "./evm";
import { OWN_ADDRESS_MAX_INDEX, ownAddressIndexes } from "./own-addresses";

const ABANDON =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OTHER = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const seeds = [{ id: "d", name: "Dummy", words: ABANDON, fingerprint: "73c5da0a" }];

async function addr(words: string, i: number) {
  const root = HDKey.fromMasterSeed(await mnemonicToSeed(words, ""));
  const k = root.derive(`m/44'/60'/0'/0/${i}`).privateKey!;
  return privateKeyToAccount(`0x${Buffer.from(k).toString("hex")}`).address;
}
const dummyEvm = {
  format: "hm-evm-tx",
  v: 1,
  fp: "73c5da0a",
  path: "m/44'/60'/0'/0/0",
  chainId: 1,
  from: "0x9858effd232b4033e47d90003d41ec34ecaeda94",
  nonce: 7,
  type: "eip1559",
  maxFeePerGas: "30000000000",
  maxPriorityFeePerGas: "1000000000",
};
const disperse = (recipients: string[]) =>
  JSON.stringify({
    ...dummyEvm,
    kind: "native-disperse",
    to: "0xD152f549545093347A162Dce210e7293f1452150",
    recipients,
    values: recipients.map(() => "1000000000000000"),
    value: (1000000000000000n * BigInt(recipients.length)).toString(),
    gas: String(40_000 + 20_000 * recipients.length),
  });

describe("bulk payment own-address labels", () => {
  it("labels #1, #57 and #999 as this seed's own addresses", async () => {
    const own = [await addr(ABANDON, 1), await addr(ABANDON, 57), await addr(ABANDON, 999)];
    const r = await reviewEvm(disperse(own), seeds);
    expect(r.payouts?.map((p) => p.ownIndex)).toEqual([1, 57, 999]);
  });

  it("marks another seed's address and own index 1000 as strangers, and still signs", async () => {
    const list = [
      await addr(ABANDON, 2),
      await addr(OTHER, 2),
      await addr(ABANDON, OWN_ADDRESS_MAX_INDEX + 1),
    ];
    const r = await reviewEvm(disperse(list), seeds);
    expect(r.payouts?.map((p) => p.ownIndex)).toEqual([2, null, null]);
    const { hex } = await signEvm(r, seeds);
    expect(parseTransaction(hex as TransactionSerialized).data?.slice(0, 10)).toBe("0xe63d38ed");
  });

  it("only ever looks at the seed named by the request's fingerprint", async () => {
    const root = HDKey.fromMasterSeed(await mnemonicToSeed(OTHER, ""));
    expect(ownAddressIndexes(root, [await addr(ABANDON, 3), await addr(OTHER, 3)])).toEqual([
      null,
      3,
    ]);
  });

  it("checks all 1,000 addresses for a 50-stranger list quickly", async () => {
    const strangers = Array.from(
      { length: 50 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "e")}`,
    );
    const t = performance.now();
    const r = await reviewEvm(disperse(strangers), seeds);
    const ms = performance.now() - t;
    expect(r.payouts?.every((p) => p.ownIndex === null)).toBe(true);
    expect(ms).toBeLessThan(5000);
  });
});
