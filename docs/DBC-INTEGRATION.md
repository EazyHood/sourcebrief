# DBC launch evidence in Sourcebrief

Verified 9 October 2026. SDK pinned to `@meteora-ag/dynamic-bonding-curve-sdk@1.5.13`.

Sourcebrief helps a researcher separate a market claim from its supporting evidence. Prediction-market briefs read resolution rules through Panta. Launch briefs read the actual Meteora DBC pool and configuration through Solami, calculate what the current curve implies, and preserve a checkpoint that can be compared and exported. A Panta market and a launch token are **not assumed to be related**.

## What depends on Meteora

The module decodes Meteora's program-owned accounts with the official SDK coder; verifies the derived pool address; interprets curve segments, fee schedules, activation and migration flags; and calls the SDK's `swapQuote` function for an exact-input mathematical scenario. It distinguishes curve completion from executed migration. This is substantially different from labeling an arbitrary token price feed with the sponsor's name.

There are no wallet, signer, transaction-building, simulation or transaction-broadcast paths. The calculator is local arithmetic against the captured accounts. It is not an executed swap, a promised output, a token recommendation or a security audit.

## Read path and coherence

`createDbcService({ rpc })` accepts the configured read-only Solami service or a compatible injected function. It returns `.brief(poolAddress, { refresh, quoteAmount })`.

1. Read the pool to discover its configuration and base mint.
2. Read the referenced configuration to discover the quote mint.
3. Fetch pool, configuration, base mint, quote mint and Solana Clock together with `getMultipleAccounts` and a monotonic `minContextSlot`.
4. Verify that the references still match and decode only the final joint response. Its context slot and five account hashes are exported.

The Solami transport independently verifies the **full** mainnet genesis hash: `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`. There is no alternative-RPC fallback in the launch service. Missing provider access produces an explicit unavailable state, not a static response disguised as live.

Account owners, executable flags, discriminators, exact pool/config lengths, bounded mint lengths, base64 validity, referenced mint/config addresses, derived pool address, token decimals and curve ordering are checked before analysis. Public amounts remain decimal strings and use BN/BigInt arithmetic. Price display is rounded down to 18 decimal places, retaining more places for a positive value that would otherwise appear as zero. Its exact rational value is available in the export.

## Public response contract

`GET /api/launch/:pool?refresh=1&quoteAmount=0.1` returns `version: 1`, `type: "dbc-launch"` plus:

| Field | Meaning |
| --- | --- |
| `pool` | Address, config, creator, mints, account type, hook program, PDA verification |
| `tokens.base`, `tokens.quote` | Decimals, exact mint supply, SPL/Token-2022, current mint/freeze authority |
| `reserves` | Raw strings and decimal amounts; these are the DBC account's recorded reserve fields |
| `migration` | Separate completion/migration states, threshold, remaining amount, progress, destination and configured liquidity shares |
| `fees` | Fee mode, base fee for the entered scenario, cliff fee, dynamic-fee flag, collection asset, destination configuration |
| `curve` | Current/start/migration prices, exact rational price, segment boundaries, activation |
| `quote` | Available or reasoned abstention; when available: input, net input, output, minimum at 50 bps tolerance, fee breakdown and next price |
| `findings` | Evidence-based observations with code, severity, title and scope |
| `provenance` | Provider, mainnet identity, live/recorded mode, observation time, context/Clock slots, hashes, decoder and limits |

The UI must display unknown token names as unknown or a shortened mint, never invent symbols. Only canonical wrapped SOL and USDC mints receive a known symbol. A derived destination address is explicitly **not verified** as an existing or liquid destination pool. Configured locked liquidity percentages describe configuration, not independently verified destination holdings.

## Deliberate abstentions

- Migrated or completed DBC pools do not return a DBC quote; their trading destination must be inspected separately.
- Transfer-hook pools are decoded, but their arbitrary external hook behavior is not simulated.
- Token-2022 pools are readable, but this version abstains on the calculator because it does not simulate their complete extension behavior.
- Future activation, an amount the SDK cannot quote, unsupported account layouts, unsafe integer conversions and incoherent references are not silently approximated.
- User-entered amounts must be positive ordinary decimals, fit u64 base units and respect token precision. There is no rounding of an invalid input.
- No traction, launch ownership, actual swap, exploit safety or future outcome is claimed.

## Real mainnet proof

Three examples were independently discovered from public DBC transactions and then captured through **Solami** at context slots `455030227`, `455030235` and `455030241` on 9 October 2026 at 22:49 UTC:

| Pool | Observed state | Result |
| --- | --- | --- |
| `7chtSL1MVDZ3kMShbnWH8htZE5gayon4t4NMF21cKyqn` | Standard active SOL launch | Two curve segments; reserve 6.533410978 SOL / threshold 85 SOL. The 0.1 SOL mathematical input gives 2420973.106714988 base tokens, with 0.002 SOL of aggregate fees. |
| `5ktYWjqP8xYTpsiATvUNgW3r62hc9Vg9uQHsjeayvDvo` | Migrated | Quote refused; destination liquidity not claimed. |
| `6tdNjDNFzDdEuKyyvtKtke4Zuarp3MyZwCiERwTsq5Xg` | Transfer hook, active | Config decoded; quote refused because external hook execution is unverified. |

These are third-party public pools, not our launches, users or endorsements. Their state can change. The test fixture is labeled recorded and never used as the live API response.

To capture current evidence yourself:

```sh
# Configure a private SOLAMI_API_KEY or SOLAMI_KEY_FILE first.
node scripts/dbc-capture.mjs ./artifacts/dbc-mainnet-capture.json
node --test test/dbc.test.mjs
```

The capture script saves only sanitized RPC provenance and public account data. It spaces examples to respect the application's rate guard. It does not save private endpoint credentials.

## Official references and licenses

- [SDK repository and MIT license](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk)
- [Official SDK function documentation](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/main/packages/dynamic-bonding-curve/docs.md)
- [Program account model](https://docs.meteora.ag/developer-guides/dbc/program/accounts)
- [DBC developer guide](https://docs.meteora.ag/developer-guides/dbc)

The SDK's MIT license does not relicense the separately licensed on-chain programs. Sourcebrief invokes existing public program data; it does not copy or deploy the program.
