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
    timeoutSeconds: 300,
    progressEverySeconds: 2,
  }, (event) => events.push(event));

  assert.equal(result.exitCode, 0, `${testCase.name} should exit successfully`);
  const final = events.findLast((event) => event.type === "result");
  assert.ok(final, `${testCase.name} should emit a result event`);
  assert.equal(final.status, "completed", `${testCase.name} should complete`);
  assert.equal(final.rows, testCase.rows, `${testCase.name} row count`);
  assert.ok(Array.isArray(final.rawRows), `${testCase.name} should include raw rows`);
  assert.equal(final.rawRows.length, testCase.rows, `${testCase.name} raw row count`);
  assert.equal(final.currentValue, testCase.currentValue, `${testCase.name} current value`);
  assert.equal(final.currentAero, testCase.currentAero, `${testCase.name} current AERO`);
  assert.equal(final.lastRow, testCase.lastRow, `${testCase.name} last row`);
  const lastRaw = final.rawRows.at(-1);
  assert.equal(lastRaw.time, testCase.start.slice(0, 10) === "2026-02-01" ? `${testCase.end.replace(" ", "T")}:00Z` : lastRaw.time, `${testCase.name} last raw timestamp`);
  assert.equal(lastRaw.event, "price change", `${testCase.name} last raw event`);
  assert.equal(typeof lastRaw.blockNumber, "number", `${testCase.name} raw block number`);
  assert.equal(typeof lastRaw.price, "number", `${testCase.name} raw price`);
  assert.equal(typeof lastRaw.value, "number", `${testCase.name} raw value`);
  assert.equal(typeof lastRaw.lpFeesUsdcValue, "number", `${testCase.name} raw LP fee estimate`);
  assert.equal(typeof lastRaw.valueWithLpFees, "number", `${testCase.name} raw value with LP fees`);
  assert.equal(lastRaw.missingCandle, false, `${testCase.name} should not mark fixture rows missing`);
  assert.ok(final.dataQuality && typeof final.dataQuality.rowCount === "number", `${testCase.name} should include data quality`);
  if (testCase.hasRebalance) {
    assert.ok(events.some((event) => String(event.lastRow || "").includes("rebalance")), `${testCase.name} should include a rebalance row`);
    assert.ok(final.rawRows.some((row) => row.rebalance), `${testCase.name} should include raw rebalance data`);
  }
}

async function main() {
  testCompleteMinuteRows();

  await runCase({
    name: "two-minute-range",
    start: "2026-02-01 00:00",
    end: "2026-02-01 00:02",
    rows: 3,
    currentValue: "$9,988.05",
    currentAero: "$0.44",
    lastRow: "2026-02-01 00:02\tprice change\t$9,988.05\t$2,445.43\t2.72582127\t3,322.25\t$0.19\t$0.13\t96.00%",
  });

  await runCase({
    name: "five-minute-range",
    start: "2026-02-01 00:00",
    end: "2026-02-01 00:05",
    rows: 6,
    currentValue: "$10,005.23",
    currentAero: "$1.28",
    lastRow: "2026-02-01 00:05\tprice change\t$10,005.23\t$2,452.20\t2.34785504\t4,247.82\t$0.30\t$0.31\t96.00%",
  });

  await runCase({
    name: "narrow-range-rebalance",
    start: "2026-02-01 00:00",
    end: "2026-02-01 00:20",
    rangePct: 0.1,
    rows: 21,
    currentValue: "$9,998.08",
    currentAero: "$9.52",
    lastRow: "2026-02-01 00:20\tprice change\t$9,998.08\t$2,473.29\t1.76061013\t5,643.58\t$0.59\t$0.79\t96.00%",
    hasRebalance: true,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
