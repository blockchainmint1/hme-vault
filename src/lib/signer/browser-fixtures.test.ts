// Temporary fixture generator for browser verification. Deleted after use.
import { expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { address as baddress, payments, Psbt, Transaction } from "bitcoinjs-lib";
import { encodeFunctionData } from "viem";
import { lockText } from "../vault/format";
import { NETWORKS } from "./networks";

const words =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const PASSWORD = "Correct-Horse-Battery-9";
const MEMO = "=:ETH.ETH:0x1111111111111111111111111111111111111111:10000000/1/1";
const ROUTER = "0xD37BbE5744D730a1d98d8DC97c42F0Ca46aD7146";
const INBOUND = "0x1111111111111111111111111111111111111111";
const ZERO = "0x0000000000000000000000000000000000000000";
const DEPOSIT_ABI = [
  {
    type: "function",
    name: "depositWithExpiry",
    stateMutability: "payable",
    inputs: [
      { name: "vault", type: "address" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "memo", type: "string" },
      { name: "expiry", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

it("writes browser fixtures", async () => {
  mkdirSync("/tmp/browser", { recursive: true });
  const root = HDKey.fromMasterSeed(await mnemonicToSeed(words));
  const fp = root.fingerprint.toString(16).padStart(8, "0");
  const payload = {
    v: 1,
    kind: "hm-seed-vault",
    seeds: [{ id: "dummy", name: "Dummy", words, fingerprint: fp, createdAt: Date.now() }],
    secrets: [],
  };
  const blob = await lockText(JSON.stringify(payload), PASSWORD);
  expect(blob.startsWith("HMVAULT1.")).toBe(true);
  writeFileSync("/tmp/browser/vault-blob.txt", blob);

  // BTC swap PSBT: deposit, change back to input 0, memo last.
  const path = "m/44'/0'/0'/0/0";
  const key = root.derive(path);
  const fpBytes = Uint8Array.from(Buffer.from(fp, "hex"));
  const own = payments.p2pkh({ pubkey: key.publicKey!, network: NETWORKS.BTC });
  const prev = new Transaction();
  prev.addInput(new Uint8Array(32), 0xffffffff);
  prev.addOutput(own.output!, 1_000_000_000n);
  const psbt = new Psbt({ network: NETWORKS.BTC });
  psbt.addInput({
    hash: prev.getId(),
    index: 0,
    nonWitnessUtxo: prev.toBuffer(),
    bip32Derivation: [{ masterFingerprint: fpBytes, path, pubkey: key.publicKey }],
  });
  const depositKey = root.derive("m/44'/0'/9'/0/0");
  psbt.addOutput({
    script: payments.p2pkh({ pubkey: depositKey.publicKey!, network: NETWORKS.BTC }).output!,
    value: 500_000n,
  });
  psbt.addOutput({
    script: own.output!,
    value: 999_490_000n,
    bip32Derivation: [{ masterFingerprint: fpBytes, path, pubkey: key.publicKey }],
  });
  psbt.addOutput({
    script: payments.embed({ data: [new TextEncoder().encode(MEMO)] }).output!,
    value: 0n,
  });
  writeFileSync("/tmp/browser/btc-swap.psbt.txt", psbt.toBase64());

  // EVM swap request with a live expiry.
  const expiry = Math.floor(Date.now() / 1000) + 900;
  const request = {
    format: "hm-thor-swap",
    v: 1,
    fp,
    path: "m/44'/60'/0'/0/0",
    action: "evm-deposit",
    quote: {
      provider: "thorchain",
      from: "ETH.ETH",
      to: "BTC.BTC",
      rawIn: "1000000000000000000",
      amountIn: "10000000",
      destination: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      inbound: INBOUND,
      router: ROUTER,
      memo: "=:BTC.BTC:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:10000000/1/1",
      expiry,
      expectedOut: "10000000",
      minimumOut: "10000000",
      feeOut: "10000",
      seconds: 60,
      toleranceBps: 50,
      quotedAt: new Date().toISOString(),
    },
    transaction: {
      from: "0x9858effd232b4033e47d90003d41ec34ecaeda94",
      chainId: 1,
      nonce: 7,
      to: ROUTER,
      value: "1000000000000000000",
      data: encodeFunctionData({
        abi: DEPOSIT_ABI,
        functionName: "depositWithExpiry",
        args: [INBOUND, ZERO, 1000000000000000000n, request_memo(), BigInt(expiry)],
      }),
      gas: "21000",
      type: "eip1559",
      maxFeePerGas: "30000000000",
      maxPriorityFeePerGas: "1000000000",
    },
  };
  writeFileSync("/tmp/browser/evm-swap.json", JSON.stringify(request));
  console.log("FIXTURES", fp, blob.length, psbt.toBase64().length, JSON.stringify(request).length);
});

function request_memo() {
  return "=:BTC.BTC:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:10000000/1/1";
}
void baddress;
