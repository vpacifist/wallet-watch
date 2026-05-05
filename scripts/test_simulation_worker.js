const assert = require("assert/strict");
const { runSimulation } = require("./simulation_runtime");

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
  assert.equal(final.currentValue, testCase.currentValue, `${testCase.name} current value`);
  assert.equal(final.currentAero, testCase.currentAero, `${testCase.name} current AERO`);
  assert.equal(final.lastRow, testCase.lastRow, `${testCase.name} last row`);
  if (testCase.hasRebalance) {
    assert.ok(events.some((event) => String(event.lastRow || "").includes("rebalance")), `${testCase.name} should include a rebalance row`);
  }
}

async function main() {
  await runCase({
    name: "two-minute-range",
    start: "2026-02-01 00:00",
    end: "2026-02-01 00:02",
    rows: 3,
    currentValue: "$9,988.05",
    currentAero: "$0.44",
    lastRow: "2026-02-01 00:02\tprice change\t$9,988.05\t$2,445.43\t2.72582127\t3,322.25\t$0.19\t-$0.00\t96.00%",
  });

  await runCase({
    name: "five-minute-range",
    start: "2026-02-01 00:00",
    end: "2026-02-01 00:05",
    rows: 6,
    currentValue: "$10,005.23",
    currentAero: "$1.28",
    lastRow: "2026-02-01 00:05\tprice change\t$10,005.23\t$2,452.20\t2.34785504\t4,247.82\t$0.30\t-$0.00\t96.00%",
  });

  await runCase({
    name: "narrow-range-rebalance",
    start: "2026-02-01 00:00",
    end: "2026-02-01 00:20",
    rangePct: 0.1,
    rows: 21,
    currentValue: "$9,998.08",
    currentAero: "$9.52",
    lastRow: "2026-02-01 00:20\tprice change\t$9,998.08\t$2,473.29\t1.76061013\t5,643.58\t$0.59\t-$0.01\t96.00%",
    hasRebalance: true,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
