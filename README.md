# Wallet Watch

Web tool for simulating a WETH/USDC Aerodrome Slipstream concentrated-liquidity position on historical Base data.

## Local Run

```bash
python scripts/serve_with_rpc.py
```

Open:

```text
http://127.0.0.1:8003/index.html
```

By default `START` creates a server-side simulation job through `/api/simulations`. The calculation runs in the Node worker, so the browser tab can be closed and reopened later.

For the legacy in-browser simulation mode:

```text
http://127.0.0.1:8003/index.html?local-sim=1
```

## Tests

```bash
npm test
```

The suite covers core math, server API contracts, deterministic short historical simulation scenarios, rebalance rows, LP fee accounting, AERO reward dilution, and missing-candle handling.

## Simulation Accuracy

The CSV is used as the minute time grid and chart layer. Economic calculations use historical on-chain state at Base block tags: block timestamps, `slot0`, tick, active liquidity, staked liquidity, reward growth, fee growth, AERO/USDC price state, swap logs for range exits, and quoter calls for rebalance swaps when available.

### Source Labels

Every raw row can expose these labels:

- `exact-onchain`: direct historical RPC state or logs at a numeric Base block.
- `reconstructed-onchain`: derived from exact on-chain fields using contract math, such as `feeGrowthInside` or quoter output from historical `eth_call`.
- `counterfactual-adjusted`: on-chain growth adjusted for the hypothetical liquidity added by this simulation.
- `estimated`: cost or value that cannot be exactly recovered from historical state.
- `heuristic`: quality score or CSV cross-check that does not drive economics.
- `fallback`: explicit degraded path after historical RPC/quoter data is unavailable.

### Exact On-Chain Inputs

- Historical block lookup uses binary search around a Base timestamp anchor and verifies block timestamps.
- WETH/USDC price and tick come from pool `slot0` at the historical block.
- Range exits are detected from historical `Swap` logs and the emitted tick.
- AERO price comes from the historical AERO/USDC Slipstream pool state.
- Historical L2 gas uses the block `baseFeePerGas`.

### Reconstructed On-Chain Values

- LP fee growth uses `feeGrowthGlobal0X128`, `feeGrowthGlobal1X128`, and `ticks(tickLower/tickUpper)` to reconstruct `feeGrowthInside`, including below-range, in-range, above-range, and uint256 wraparound accounting.
- AERO rewards use pool reward state: `rewardGrowthGlobalX128`, `rewardRate`, `rewardReserve`, `lastUpdated`, `stakedLiquidity`, and `getRewardGrowthInside`. Reward reserve caps are applied before reconstructing inside growth.
- Rebalance swaps use Aerodrome Slipstream quoter historical `eth_call` when possible. Quoter calls are retried and token pair direction is validated before any fallback is used.

### Counterfactual-Adjusted Values

- Simulated liquidity is hypothetical. Fee and reward growth observed on-chain excludes this position, so the engine applies a dilution factor using observed real liquidity versus simulated added liquidity.
- If the position crosses its range during an interval, fee rows are tagged with range-crossing metadata; endpoint `feeGrowthInside` remains the source of token fee growth and swap logs are used for sub-interval transparency where available.
- AERO `aeroBase` is the reconstructed reward scenario before impact haircut. `aeroConservative` applies the configurable conservative impact haircut. `aeroImpactHaircut`, `aeroImpactModel`, and `aeroImpactAssumption` are exposed in raw rows.

### Estimated Costs

- Rebalance gas uses configured gas units plus a configured Base L1 data fee estimate. It reads historical L2 `baseFeePerGas`, but it does not reconstruct exact transaction calldata bytes or L1 fee scalar fields for the non-existent transaction.
- Raw rebalance rows expose `gasSource`, `l2GasFeeUsdc`, `l1DataFeeUsdc`, `gasReliability`, and `gasAssumptions`.
- If the quoter call fails after retries, the fallback loss is `REBALANCE_FALLBACK_SLIPPAGE_BPS`; raw rows expose `swapSource = "fallback"`, `swapSourceLabel = "fallback"`, `quoteFailureReason`, `quoteAttempts`, and `fallbackSlippageBps`.
- Automation/manual rebalance fee is a configurable bps assumption.

### Heuristic Quality Signals

- `reliability` is a transparent quality score, not statistical confidence. It combines named components such as block match, on-chain price availability, reward-state health, quote source, gas estimate quality, and CSV/on-chain price cross-check.
- CSV prices are not used for economic calculations; they are retained as the minute grid, chart layer, missing-candle marker, and CSV/on-chain divergence cross-check.
- AERO impact haircut is conservative scenario modeling for impact from adding own liquidity. It is not an Aerodrome contract field.

### Limitations

- The simulator does not mint a real NFT and cannot know exact future MEV, route execution, automation transaction calldata, or private relay behavior.
- Fee/reward dilution uses observed historical liquidity as the counterfactual base. This is closer than raw swap-log pro rata accounting, but still not a full alternate-chain replay.
- Exact Base L1 data fee cannot be recovered without a real transaction envelope/calldata and final chain fee fields. The configured L1 data fee is an explicit model assumption.
- If historical `feeGrowthInside` reads fail, LP fees fall back to swap-log estimation and the row exposes the lower-reliability source.
- Missing CSV candles are filled only to preserve the minute grid. Filled rows are marked `missing-candle`; economics still use on-chain state.

## RPC And Cache

`scripts/serve_with_rpc.py` proxies Base RPC and caches only historical calls:

- `eth_getBlockByNumber` with numeric block tags.
- `eth_call` with numeric block tags.
- supported `eth_getLogs` filters with numeric `fromBlock` and `toBlock`.

`latest`, `pending`, `safe`, and `finalized` are not exact-cacheable. Large log ranges are split into bounded chunks before upstream requests, then normalized and deduplicated in SQLite. Cache hits are returned only when stored ranges fully cover the requested interval.

## Railway

Railway starts the app with:

```bash
python scripts/serve_with_rpc.py
```

The server listens on `0.0.0.0:$PORT` when Railway provides `PORT`.

Recommended environment variables:

```text
PUBLIC_BASE_URL=https://your-railway-domain.up.railway.app
MARKET_DATA_PATH=/data/market_data.sqlite
SIM_DATA_PATH=/data/simulations.sqlite
BASE_RPC_URLS=https://base.drpc.org,https://base.gateway.tenderly.co,https://mainnet.base.org,https://base.llamarpc.com
MAX_RUNNING_SIMULATIONS=1
MAX_SIMULATION_DAYS=31
RPC_RATE_LIMIT_PER_MINUTE=300
API_RATE_LIMIT_PER_MINUTE=60
SERVER_SIMULATION_POLL_MS=2500
REBALANCE_MANUAL_FEE_BPS=1
REBALANCE_GAS_UNITS=1450000
REBALANCE_L1_DATA_FEE_ETH=0.000012
REBALANCE_FALLBACK_SLIPPAGE_BPS=5
AERO_IMPACT_HAIRCUT_MAX=0.5
MAX_LOG_BLOCK_SPAN=2000
```

Use a Railway Volume mounted at `/data` to persist market-data and simulation caches across restarts.

For public deployments set `ADMIN_API_TOKEN`; create/cancel/delete simulation APIs then require the token. Do not commit real tokens, secrets, or private RPC URLs. Keep them in `.env`, local environment, or Railway Environment Variables.

RPC compatibility check:

```bash
BASE_RPC_URLS="https://provider-1.example/...,https://provider-2.example/..." python scripts/check_base_rpc.py
```

The check covers `eth_getBlockByNumber`, historical `eth_call`, batch requests, and `eth_getLogs` on Base. Output redacts URLs, but real RPC URLs should still stay out of the repository.
