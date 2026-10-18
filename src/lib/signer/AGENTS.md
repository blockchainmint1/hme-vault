# Signer rules

- Offline signing (`src/lib/signer`) requires explicit PSBT network selection (TXC legacy coin-0 remains TXC only when selected), verifies every input fingerprint/path/script and SIGHASH_ALL, and permits EVM native/ERC-20 transfers only with chain-bound fees and matching sender; signed raw hex leaves by QR. Why: PSBT has no chain ID, and blind calls or unverified fees defeat offline review.
- EVM signing uses local viem account signing, strict versioned transfer intents and locally encoded ERC-20 calldata; unknown networks/tokens display raw units. Why: the vault cannot fetch trusted metadata and must never accept opaque contract calls.
