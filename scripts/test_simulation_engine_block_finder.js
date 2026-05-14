const assert = require("assert/strict");
const WalletWatchSimulationEngine = require("../simulation_engine");

function makeEngine(blocks, options = {}) {
  const byNumber = new Map(blocks.map((block) => [block.number, block]));
  const rpcCache = new Map();
  let rpcCalls = 0;
  const timings = [];
  const engine = WalletWatchSimulationEngine.create({
    state: { sim: {} },
    performance,
    findBlockAtOrAfter: async () => {
      throw new Error("generic finder should not be used by sequential tests");
    },
    findSwapExit: async () => null,
    estimateLpFees: async () => ({}),
    getBlock: async (number) => {
      const normalized = Math.max(1, Math.min(blocks.at(-1).number, number));
      if (!rpcCache.has(normalized)) {
        rpcCalls += 1;
        rpcCache.set(normalized, byNumber.get(normalized));
      }
      return rpcCache.get(normalized);
    },
    readRewardInside: async () => ({}),
    getAeroPrice: async () => 0,
    ensureActiveSimulation: () => {},
    priceForTick: () => 0,
    priceFromSqrtX96: () => 0,
    computePositionPlanForRange: () => ({}),
    tickRangeAroundTick: () => ({}),
    estimateHistoricalSwap: async () => ({}),
    rewardStateReliability: () => 100,
    blockTimeReliability: () => 100,
    priceAgreementReliability: () => 100,
    conservativeReliability: () => ({ score: 100, parts: [] }),
    scoreFromThresholds: () => 100,
    fmtNumber: String,
    fmtUsdc: String,
    reliabilityDetailsText: () => "",
    AERODROME_TICK_SPACING: 100,
    REBALANCE_MANUAL_FEE_BPS: 1,
    REBALANCE_GAS_UNITS: 1n,
    REBALANCE_L1_DATA_FEE_ETH: 0,
    REBALANCE_FALLBACK_SLIPPAGE_BPS: 5,
    AERO_IMPACT_HAIRCUT_MAX: 0,
    Q128: 2n ** 128n,
    AERO_DECIMALS: 10n ** 18n,
    recordSimulationStepDuration: () => {},
    recordSimulationTiming: (name) => timings.push(name),
    simulationProgressText: () => "",
    setSimulationNotice: () => {},
    renderSimulationTable: () => {},
    updateSimulationControls: () => {},
    secondsPerBlock: options.secondsPerBlock || 2,
  });
  return {
    engine,
    rpcCalls: () => rpcCalls,
    timings,
  };
}

async function testMonotonicMinuteTimestampsUseCursorEstimate() {
  const blocks = Array.from({ length: 180 }, (_, index) => ({
    number: index + 1,
    timestamp: 1000 + index * 2,
    baseFeePerGas: 0n,
  }));
  const { engine, rpcCalls } = makeEngine(blocks);
  let previous = await engine.findSequentialBlockAtOrAfter(1000, 1);
  assert.equal(previous.number, 1);
  for (let minute = 1; minute <= 4; minute += 1) {
    const block = await engine.findSequentialBlockAtOrAfter(1000 + minute * 60, previous.number);
    assert.equal(block.timestamp, 1000 + minute * 60);
    previous = block;
  }
  assert.ok(rpcCalls() <= 6, `expected one confirmed scan then fast exact-cadence lookups, got ${rpcCalls()} getBlock calls`);
}

async function testDuplicateTimestampsReturnFirstAllowedDuplicate() {
  const blocks = [
    { number: 1, timestamp: 100 },
    { number: 2, timestamp: 102 },
    { number: 3, timestamp: 104 },
    { number: 4, timestamp: 104 },
    { number: 5, timestamp: 106 },
  ];
  const { engine } = makeEngine(blocks);
  assert.equal((await engine.findSequentialBlockAtOrAfter(104, 2)).number, 3);
  engine.resetSequentialBlockCursor();
  assert.equal((await engine.findSequentialBlockAtOrAfter(104, 4)).number, 4);
}

async function testAfterBlockFloorIsRespected() {
  const blocks = [
    { number: 1, timestamp: 100 },
    { number: 2, timestamp: 100 },
    { number: 3, timestamp: 102 },
    { number: 4, timestamp: 104 },
  ];
  const { engine } = makeEngine(blocks);
  assert.equal((await engine.findSequentialBlockAtOrAfter(100, 2)).number, 2);
}

async function testVariableBlockTimesFallBackToBoundedSearch() {
  const blocks = [
    { number: 1, timestamp: 100 },
    { number: 2, timestamp: 103 },
    { number: 3, timestamp: 107 },
    { number: 4, timestamp: 116 },
    { number: 5, timestamp: 119 },
    { number: 6, timestamp: 130 },
    { number: 7, timestamp: 131 },
    { number: 8, timestamp: 143 },
  ];
  const { engine } = makeEngine(blocks);
  assert.equal((await engine.findSequentialBlockAtOrAfter(118, 1)).number, 5);
  assert.equal((await engine.findSequentialBlockAtOrAfter(132, 5)).number, 8);
}

async function main() {
  await testMonotonicMinuteTimestampsUseCursorEstimate();
  await testDuplicateTimestampsReturnFirstAllowedDuplicate();
  await testAfterBlockFloorIsRespected();
  await testVariableBlockTimesFallBackToBoundedSearch();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
