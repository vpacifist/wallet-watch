const assert = require("assert/strict");
const { runSimulation } = require("./simulation_runtime");
const WalletWatchCore = require("../simulation_core");

const core = WalletWatchCore.create({
  MONTHS_SHORT: [],
  AERODROME_TICK_SPACING: 100,
  PRICE_DECIMAL_FACTOR: 1e12,
  Q96: 2n ** 96n,
  Q128: 2n ** 128n,
  WETH_DECIMALS: 10n ** 18n,
  USDC_DECIMALS: 10n ** 6n,
  AERO_ADDRESS: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
  USDC_ADDRESS: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
});

function testCompleteMinuteRows() {
  const rows = core.parseCsv([
    "time_open,time_close,open,high,low,close,volume",
    "2026-02-01T00:00:00Z,2026-02-01T00:01:00Z,100,101,99,100,10",
    "2026-02-01T00:03:00Z,2026-02-01T00:04:00Z,103,104,102,103,10",
  ].join("\n"));
  const complete = core.buildCompleteMinuteRows(rows);
  assert.equal(complete.length, 4, "minute grid should fill two missing minutes");
  assert.equal(complete[1].time, "2026-02-01T00:01:00Z");
  assert.equal(complete[2].time, "2026-02-01T00:02:00Z");
  assert.equal(complete[1].missingCandle, true);
  assert.deepEqual(complete[1].qualityFlags, ["missing-candle"]);
  assert.equal(complete[1].close, 100);
  assert.equal(complete[3].missingCandle, false);
}

async function runCase(testCase) {
  const events = [];
  const result = await runSimulation({
    id: testCase.name,
    url: "http://127.0.0.1:8003/index.html?local-sim=1",
    start: testCase.start,
    end: testCase.end,
    deposit: "10000",
    rangePct: testCase.rangePct ?? 1,
    timeoutSeconds: testCase.timeoutSeconds ?? 300,
    progressEverySeconds: 2,
  }, (event) => events.push(event));

  if (result.exitCode !== 0) {
    console.error("FULL_RESULT", JSON.stringify(result, null, 2));
  }
  assert.equal(result.exitCode, 0, `${testCase.name} should exit successfully`);
  const final = events.findLast((event) => event.type === "result");
  assert.ok(final, `${testCase.name} should emit a result event`);
  assert.equal(final.status, "completed", `${testCase.name} should complete`);
  assert.equal(final.rows, testCase.rows, `${testCase.name} row count`);
  assert.ok(Array.isArray(final.rawRows), `${testCase.name} should include raw rows`);
  assert.equal(final.rawRows.length, testCase.rows, `${testCase.name} raw row count`);
  assert.equal(final.currentValue, testCase.currentValue, `${testCase.name} current value`);
  assert.equal(final.currentReward, testCase.currentReward, `${testCase.name} current AERO`);
  assert.equal(final.lastRow, testCase.lastRow, `${testCase.name} last row`);
  const lastRaw = final.rawRows.at(-1);
  assert.equal(lastRaw.time, testCase.start.slice(0, 10) === "2026-02-01" ? `${testCase.end.replace(" ", "T")}:00Z` : lastRaw.time, `${testCase.name} last raw timestamp`);
  assert.equal(lastRaw.event, testCase.lastEvent ?? "price change", `${testCase.name} last raw event`);
  assert.equal(typeof lastRaw.blockNumber, "number", `${testCase.name} raw block number`);
  assert.equal(typeof lastRaw.price, "number", `${testCase.name} raw price`);
  assert.equal(typeof lastRaw.value, "number", `${testCase.name} raw value`);
  assert.equal(typeof lastRaw.lpFeesUsdcValue, "number", `${testCase.name} raw LP fee estimate`);
  assert.equal(typeof lastRaw.valueWithLpFees, "number", `${testCase.name} raw value with LP fees`);
  assert.equal(lastRaw.aeroModel, "conservative-scenario", `${testCase.name} should expose conservative AERO model`);
  assert.equal(lastRaw.aeroSource, "gauge-rewardInside-reconstructed", `${testCase.name} should expose AERO source`);
  assert.equal(lastRaw.aeroSourceLabel, "counterfactual-adjusted", `${testCase.name} should expose AERO source label`);
  assert.equal(typeof lastRaw.aeroBase, "number", `${testCase.name} should expose base AERO scenario`);
  assert.equal(typeof lastRaw.aeroConservative, "number", `${testCase.name} should expose conservative AERO scenario`);
  assert.equal(typeof lastRaw.aeroImpactHaircut, "number", `${testCase.name} should expose AERO impact haircut`);
  assert.equal(lastRaw.aeroImpactModel, "counterfactual-conservative-haircut", `${testCase.name} should expose AERO impact model`);
  assert.equal(typeof lastRaw.aeroReliability, "number", `${testCase.name} should expose AERO reliability`);
  assert.ok(Array.isArray(lastRaw.sourceLabels), `${testCase.name} should expose source labels`);
  assert.ok(lastRaw.sourceLabels.includes("exact-onchain"), `${testCase.name} should include exact source label`);
  assert.equal(typeof lastRaw.csvOnchainDivergenceBps, "number", `${testCase.name} should expose CSV/on-chain divergence`);
  assert.equal(lastRaw.missingCandle, false, `${testCase.name} should not mark fixture rows missing`);
  assert.ok(final.dataQuality && typeof final.dataQuality.rowCount === "number", `${testCase.name} should include data quality`);
  assert.equal(final.dataQuality.source, "./weth_usdc_1m_2026_feb_mar_apr.csv", `${testCase.name} should include CSV source`);
  assert.equal(typeof final.dataQuality.minuteRowCount, "number", `${testCase.name} should include minute-grid row count`);
  if (testCase.hasRebalance) {
    assert.ok(events.some((event) => String(event.lastRow || "").includes("rebalance")), `${testCase.name} should include a rebalance row`);
    const rebalanceRow = final.rawRows.find((row) => row.rebalance);
    assert.ok(rebalanceRow, `${testCase.name} should include raw rebalance data`);
    assert.equal(typeof rebalanceRow.rebalance.swapIsFallback, "boolean", `${testCase.name} should mark swap fallback state`);
    assert.equal(rebalanceRow.rebalance.fallbackSlippageBps, 5, `${testCase.name} should expose fallback slippage bps`);
    assert.equal(rebalanceRow.rebalance.swapSourceLabel, rebalanceRow.rebalance.swapIsFallback ? "fallback" : "reconstructed-onchain", `${testCase.name} should expose swap source label`);
    assert.equal(typeof rebalanceRow.rebalance.gasSource, "string", `${testCase.name} should expose gas source`);
    assert.equal(typeof rebalanceRow.rebalance.l2GasFeeUsdc, "number", `${testCase.name} should expose L2 gas fee`);
    assert.equal(typeof rebalanceRow.rebalance.l1DataFeeUsdc, "number", `${testCase.name} should expose L1 data fee`);
    assert.equal(typeof rebalanceRow.rebalance.gasReliability, "number", `${testCase.name} should expose gas reliability`);
    assert.ok(Array.isArray(rebalanceRow.rebalance.gasAssumptions), `${testCase.name} should expose gas assumptions`);
    assert.equal(rebalanceRow.rebalance.automationFeeBps, 1, `${testCase.name} should expose automation fee bps`);
  }
}

async function main() {
  testCompleteMinuteRows();

  await runCase({
    name: "two-minute-range",
    start: "2026-02-01 00:00",
    end: "2026-02-01 00:02",
    rows: 3,
    currentValue: "$9,976.64",
    currentReward: "$0.78",
    lastRow: "2026-02-01 00:02\trebalance -$6.03 · swap fallback\t$9,976.64\t$2,445.37\t0.02531485\t9,914.74\t$0.78\t$0.07\t68.00%",
    lastEvent: "rebalance -$6.03",
    hasRebalance: true,
  });

  await runCase({
    name: "five-minute-range",
    start: "2026-02-01 00:00",
    end: "2026-02-01 00:05",
    rows: 6,
    currentValue: "$9,957.96",
    currentReward: "$1.26",
    lastRow: "2026-02-01 00:05\trebalance -$6.04 · swap fallback\t$9,957.96\t$2,445.61\t4.05712502\t35.83\t$0.00\t$0.00\t68.00%",
    lastEvent: "rebalance -$6.04",
    hasRebalance: true,
  });

  await runCase({
    name: "narrow-range-rebalance",
    start: "2026-02-01 00:00",
    end: "2026-02-01 00:20",
    rangePct: 0.1,
    timeoutSeconds: 600,
    rows: 21,
    currentValue: "$9,863.42",
    currentReward: "$1.26",
    lastRow: "2026-02-01 00:20\trebalance -$5.99 · swap fallback\t$9,863.42\t$2,445.47\t0.00764595\t9,844.72\t$0.00\t$0.00\t68.00%",
    lastEvent: "rebalance -$5.99",
    hasRebalance: true,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
