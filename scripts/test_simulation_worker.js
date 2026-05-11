const assert = require("assert/strict");
const { spawn } = require("child_process");
const { runSimulation } = require("./simulation_runtime");
const WalletWatchCore = require("../simulation_core");
const path = require("path");

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

const SERVER_ORIGIN = "http://127.0.0.1:8003";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(body?.error || body?.message || `HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureServer() {
  try {
    const health = await fetchJson(`${SERVER_ORIGIN}/api/health`, 800);
    if (health?.ok) return { started: false, stop() { } };
  } catch (_) { }

  const scriptPath = path.join(__dirname, "serve_with_rpc.py");
  const proc = spawn("python", [scriptPath], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "8003",
      ADMIN_API_TOKEN: "",
    },
    stdio: "ignore",
    windowsHide: true,
  });
  proc.unref();

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const health = await fetchJson(`${SERVER_ORIGIN}/api/health`, 1200);
      if (health?.ok) {
        return {
          started: true,
          stop() {
            try { proc.kill("SIGTERM"); } catch (_) { }
            try { proc.kill("SIGKILL"); } catch (_) { }
          },
        };
      }
    } catch (_) { }
    await sleep(250);
  }
  try { proc.kill(); } catch (_) { }
  throw new Error("Failed to start local server on 127.0.0.1:8003");
}

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
    url: "http://127.0.0.1:8003/index.html",
    start: testCase.start,
    end: testCase.end,
    deposit: "10000",
    rangePct: testCase.rangePct ?? 1,
    lpMode: testCase.lpMode ?? "staked",
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
  assert.equal(final.currentReward, testCase.currentReward, `${testCase.name} current reward`);
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
  const server = await ensureServer();
  try {

    await runCase({
      name: "two-minute-range",
      start: "2026-02-01 00:00",
      end: "2026-02-01 00:02",
      rows: 3,
      currentValue: "$9,982.91",
      currentReward: "$0.78",
      lastRow: "2026-02-01 00:02\tprice change\t$9,982.91\t$2,445.43\t4.08227923\t0.00\t$0.04\t$0.07\t96.00%",
      lastEvent: "price change",
      hasRebalance: false,
      lpMode: "staked",
      timeoutSeconds: 180,
    });
  } finally {
    server.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
