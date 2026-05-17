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

function makeStepState(overrides = {}) {
  const closes = overrides.closes || [100, 200, 200];
  return {
    rows: [
      { time: new Date(1000 * 1000).toISOString(), close: closes[0], open: closes[0] },
      { time: new Date(1060 * 1000).toISOString(), close: closes[1], open: closes[1] },
      { time: new Date(1120 * 1000).toISOString(), close: closes[2], open: closes[2] },
    ],
    sim: {
      started: true,
      stopped: false,
      stepInProgress: false,
      autoRunning: false,
      currentIndex: 0,
      endIndex: 2,
      rows: [{ index: 0, blockNumber: 10, stateAfter: {} }],
      activeRowIndex: 0,
      runToken: 1,
      tickLower: 0,
      tickUpper: 100,
      rangeWidth: 1,
      anchorTick: 0,
      startGridTick: 0,
      rangeStepTicks: 100,
      lastExitBlockNumber: 0,
      lastExitLogIndex: -1,
      liquidityRaw: 100n,
      liquidityHuman: 1,
      rewardStart: 0n,
      rewardLast: 0n,
      feeGrowthInside0Last: 0n,
      feeGrowthInside1Last: 0n,
      feeDilutionLiquidityLast: 0n,
      rewardDilutionLiquidityLast: 0n,
      aeroUnharvested: 0,
      aeroBaseUnharvested: 0,
      aeroHaircutUnharvested: 0,
      aeroHarvestedUsdc: 0,
      aeroBaseHarvestedUsdc: 0,
      aeroHaircutUsdc: 0,
      lpFeesWeth: 0,
      lpFeesUsdc: 0,
      lpFeesUsdcValue: 0,
      lpMode: "staked",
      aeroPriceReliability: 100,
      aeroPriceAgeSeconds: 0,
    },
  };
}

function makeStepEngine(state, findSwapExitCalls, options = {}) {
  const blocks = new Map([
    [10, { number: 10, timestamp: 1000, baseFeePerGas: 1n }],
    [11, { number: 11, timestamp: 1060, baseFeePerGas: 1n }],
    [12, { number: 12, timestamp: 1120, baseFeePerGas: 1n }],
  ]);
  return WalletWatchSimulationEngine.create({
    state,
    performance,
    findBlockAtOrAfter: async () => {
      throw new Error("generic finder should not be used by stepForward");
    },
    findSwapExit: async (fromBlock, toBlock, tickLower, tickUpper, after) => {
      findSwapExitCalls.push({ fromBlock, toBlock, tickLower, tickUpper, after });
      if (options.findSwapExit) return options.findSwapExit({ fromBlock, toBlock, tickLower, tickUpper, after, call: findSwapExitCalls.length });
      if (options.exits) return options.exits[findSwapExitCalls.length - 1] || null;
      if (findSwapExitCalls.length === 1) {
        return { blockNumber: 11, logIndex: 5, tick: 120, sqrtPriceX96: 120n };
      }
      return null;
    },
    estimateLpFees: async () => ({ weth: 0, usdc: 0, usdcValue: 0, source: "test", reliability: 100, swapCount: 0 }),
    getBlock: async (number) => blocks.get(number),
    readRewardInside: async () => ({
      tick: 50,
      sqrtPriceX96: 120n,
      rewardInside: 0n,
      activeLiquidity: 100n,
      stakedLiquidity: 100n,
      feeGrowthInside0X128: 0n,
      feeGrowthInside1X128: 0n,
      rewardReserve: 1n,
      rewardRate: 1n,
    }),
    getAeroPrice: async () => 1,
    ensureActiveSimulation: () => {},
    priceForTick: (tick) => tick,
    priceFromSqrtX96: (value) => Number(value),
    computePositionPlanForRange: (capital, price, tickLower, tickUpper, anchorTick) => ({
      tickLower,
      tickUpper,
      anchorTick,
      liquidityHuman: 1,
      liquidityRaw: 100n,
      weth: 0,
      usdc: capital,
      value: capital,
    }),
    tickRangeAroundTick: (tick) => ({ tickLower: tick - 20, tickUpper: tick + 80, anchorTick: tick }),
    estimateHistoricalSwap: options.estimateHistoricalSwap || (async () => ({ lossUsdc: 0, source: "test", reliability: 100, outputAmount: 0 })),
    rewardStateReliability: () => 100,
    blockTimeReliability: () => 100,
    priceAgreementReliability: () => 100,
    conservativeReliability: () => ({ score: 100, parts: [] }),
    scoreFromThresholds: () => 100,
    fmtNumber: String,
    fmtUsdc: (value) => `$${Number(value || 0).toFixed(2)}`,
    reliabilityDetailsText: () => "",
    AERODROME_TICK_SPACING: 100,
    REBALANCE_MANUAL_FEE_BPS: 1,
    REBALANCE_GAS_UNITS: 1n,
    REBALANCE_L1_DATA_FEE_ETH: 0,
    REBALANCE_FALLBACK_SLIPPAGE_BPS: 5,
    REBALANCE_CONFIRMATION_BUFFER_BPS: options.confirmationBufferBps || 0,
    REBALANCE_CONFIRMATION_MINUTES: options.confirmationMinutes || 1,
    AERO_IMPACT_HAIRCUT_MAX: 0,
    Q128: 2n ** 128n,
    AERO_DECIMALS: 10n ** 18n,
    recordSimulationStepDuration: () => {},
    recordSimulationTiming: () => {},
    simulationProgressText: () => "",
    setSimulationNotice: () => {},
    renderSimulationTable: () => {},
    updateSimulationControls: () => {},
    secondsPerBlock: 60,
  });
}

async function testConfirmedRebalanceSkipsRemainingLogsInSameBlock() {
  const state = makeStepState();
  const findSwapExitCalls = [];
  const engine = makeStepEngine(state, findSwapExitCalls);

  assert.equal(await engine.stepForward({ render: false }), true, "first step should rebalance");
  assert.match(state.sim.rows.at(-1).event, /^rebalance /);
  assert.equal(state.sim.lastExitBlockNumber, 11);
  assert.equal(state.sim.lastExitLogIndex, Number.MAX_SAFE_INTEGER);

  assert.equal(await engine.stepForward({ render: false }), true, "second step should continue after the rebalance block");
  assert.equal(findSwapExitCalls.length, 2);
  assert.deepEqual(findSwapExitCalls[1].after, {
    blockNumber: 11,
    logIndex: Number.MAX_SAFE_INTEGER,
  });
  assert.equal(state.sim.rows.at(-1).event, "price change");
}

async function testConfirmationBufferSuppressesBoundaryChurn() {
  const state = makeStepState({ closes: [100, 100.03, 100.03] });
  const findSwapExitCalls = [];
  const engine = makeStepEngine(state, findSwapExitCalls, { confirmationBufferBps: 5 });

  assert.equal(await engine.stepForward({ render: false }), true, "step should advance without a rebalance inside buffer");
  assert.equal(state.sim.rows.at(-1).event, "price change");
  assert.equal(state.sim.lastExitBlockNumber, 11);
  assert.equal(state.sim.lastExitLogIndex, 5);
}

async function testTwoMinuteConfirmationRequiresPreviousCloseOutsideBuffer() {
  const state = makeStepState({ closes: [100, 100.2, 100.2] });
  const findSwapExitCalls = [];
  const engine = makeStepEngine(state, findSwapExitCalls, {
    confirmationBufferBps: 5,
    confirmationMinutes: 2,
    exits: [
      { blockNumber: 11, logIndex: 5, tick: 120, sqrtPriceX96: 120n },
      { blockNumber: 12, logIndex: 1, tick: 120, sqrtPriceX96: 120n },
    ],
  });

  assert.equal(await engine.stepForward({ render: false }), true, "first outside close should wait for confirmation");
  assert.equal(state.sim.rows.at(-1).event, "price change");

  assert.equal(await engine.stepForward({ render: false }), true, "second outside close should confirm rebalance");
  assert.match(state.sim.rows.at(-1).event, /^rebalance /);
}

async function testConfirmationUsesExitSideNotJustAnyOutsideClose() {
  const state = makeStepState({ closes: [100, 200, 200] });
  const findSwapExitCalls = [];
  const exits = [
    { blockNumber: 11, logIndex: 5, tick: -20, sqrtPriceX96: 80n },
    { blockNumber: 11, logIndex: 6, tick: 120, sqrtPriceX96: 120n },
  ];
  const engine = makeStepEngine(state, findSwapExitCalls, {
    confirmationMinutes: 1,
    findSwapExit: ({ after }) => {
      if (!after) return exits[0];
      return exits.find((exit) => exit.blockNumber > after.blockNumber || (exit.blockNumber === after.blockNumber && exit.logIndex > after.logIndex)) || null;
    },
  });

  assert.equal(await engine.stepForward({ render: false }), true, "step should use the same-side exit");
  assert.match(state.sim.rows.at(-1).event, /^rebalance /);
  assert.equal(state.sim.rows.at(-1).tick, 120);
  assert.equal(findSwapExitCalls.length, 2);
}

async function testFallbackSwapQuoteMetadataIsExposedOnRebalance() {
  const state = makeStepState({ closes: [100, 200, 200] });
  const findSwapExitCalls = [];
  const engine = makeStepEngine(state, findSwapExitCalls, {
    estimateHistoricalSwap: async () => ({
      outputAmount: 9.995,
      lossUsdc: 0.005,
      source: "fallback",
      sourceLabel: "fallback",
      reliability: 45,
      failureReason: "historical swap quote failed after 2 attempts: reason=execution reverted",
      quoteAttempts: 2,
      fallbackSlippageBps: 5,
    }),
  });

  assert.equal(await engine.stepForward({ render: false }), true, "step should complete with fallback swap quote");
  const rebalance = state.sim.rows.at(-1).rebalance;
  assert.ok(rebalance, "rebalance row should include metadata");
  assert.equal(rebalance.swapSource, "fallback");
  assert.equal(rebalance.swapSourceLabel, "fallback");
  assert.equal(rebalance.swapIsFallback, true);
  assert.equal(rebalance.quoteFailureReason, "historical swap quote failed after 2 attempts: reason=execution reverted");
  assert.equal(rebalance.quoteAttempts, 2);
  assert.equal(rebalance.fallbackSlippageBps, 5);
  assert.equal(rebalance.swapLossUsdc, 0.005);
  assert.equal(rebalance.quoteReliability, 45);
}

function makeAccountingEngine(state, rewardState) {
  return WalletWatchSimulationEngine.create({
    state,
    performance,
    findBlockAtOrAfter: async () => ({ number: 2, timestamp: 1060, baseFeePerGas: 1n }),
    findSwapExit: async () => null,
    estimateLpFees: async () => ({ weth: 0, usdc: 0, usdcValue: 0, source: "test", reliability: 100, swapCount: 0 }),
    getBlock: async () => ({ number: 2, timestamp: 1060, baseFeePerGas: 1n }),
    readRewardInside: async () => rewardState,
    getAeroPrice: async () => 1,
    ensureActiveSimulation: () => {},
    priceForTick: (tick) => tick === 0 ? 90 : 110,
    priceFromSqrtX96: () => 100,
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
    AERO_DECIMALS: 1n,
    recordSimulationStepDuration: () => {},
    recordSimulationTiming: () => {},
    simulationProgressText: () => "",
    setSimulationNotice: () => {},
    renderSimulationTable: () => {},
    updateSimulationControls: () => {},
  });
}

function makeAccountingState() {
  const state = makeStepState({ closes: [100, 100] });
  state.rows = [
    { time: new Date(1000 * 1000).toISOString(), close: 100, open: 100 },
    { time: new Date(1060 * 1000).toISOString(), close: 100, open: 100 },
  ];
  Object.assign(state.sim, {
    tickLower: 0,
    tickUpper: 100,
    liquidityRaw: 100n,
    liquidityHuman: 1000,
    rewardLast: (1n << 256n) - 2n * (2n ** 128n),
    rewardDilutionLiquidityLast: 900n,
  });
  return state;
}

async function testAeroRewardsUseUint256DeltaAndStakedDenominator() {
  const q128 = 2n ** 128n;
  const rewardState = {
    tick: 50,
    sqrtPriceX96: 0n,
    rewardInside: 3n * q128,
    activeLiquidity: 9000n,
    stakedLiquidity: 900n,
    rewardReserve: 1n,
    rewardRate: 1n,
  };
  const state = makeAccountingState();
  const engine = makeAccountingEngine(state, rewardState);

  assert.equal(engine.dilutedAeroRaw(rewardState), 450n, "AERO reward delta should wrap in uint256 and dilute against staked reward liquidity");
  engine.accrueAeroRewards(rewardState);
  assert.equal(state.sim.aeroBaseUnharvested, 450, "wrapped AERO reward should accrue");
  assert.equal(state.sim.rewardLast, rewardState.rewardInside, "reward checkpoint should advance after wrapped delta");
  assert.equal(state.sim.rewardDilutionLiquidityLast, 900n, "AERO denominator checkpoint should use gauge staked liquidity, not pool active liquidity");
}

async function testAeroRowsExposeDilutionSemantics() {
  const q128 = 2n ** 128n;
  const rewardState = {
    tick: 50,
    sqrtPriceX96: 0n,
    rewardInside: 3n * q128,
    activeLiquidity: 9000n,
    stakedLiquidity: 900n,
    rewardReserve: 1n,
    rewardRate: 1n,
  };
  const state = makeAccountingState();
  state.sim.rows = [{ index: 0, blockNumber: 1, stateAfter: {} }];
  const engine = makeAccountingEngine(state, rewardState);
  const row = await engine.buildSimulationRow(1, "price change");

  assert.equal(row.aeroDilutionSource, "gauge-stakedLiquidity", "AERO dilution should name the reward-liquidity source");
  assert.equal(row.aeroDilutionSourceLabel, "counterfactual-adjusted", "AERO dilution source label should reflect counterfactual denominator adjustment");
  assert.equal(row.aeroDilutionReliability, 88, "AERO dilution reliability should be explicit");
  assert.equal(row.aeroDilutionLiquidityRaw, "900", "AERO dilution should expose the staked denominator input");
  assert.match(row.aeroDilutionDenominator, /staked reward liquidity/, "AERO dilution denominator should document staked reward semantics");
  assert.match(row.aeroDilutionAssumption, /point-in-time gauge stakedLiquidity\(\)/, "AERO dilution assumption should name the point-state approximation");
  assert.match(row.aeroDilutionAssumption, /rewardGrowthGlobal accrues against staked reward liquidity/, "AERO dilution assumption should explain why active liquidity is not used");
}

async function main() {
  await testMonotonicMinuteTimestampsUseCursorEstimate();
  await testDuplicateTimestampsReturnFirstAllowedDuplicate();
  await testAfterBlockFloorIsRespected();
  await testVariableBlockTimesFallBackToBoundedSearch();
  await testConfirmedRebalanceSkipsRemainingLogsInSameBlock();
  await testConfirmationBufferSuppressesBoundaryChurn();
  await testTwoMinuteConfirmationRequiresPreviousCloseOutsideBuffer();
  await testConfirmationUsesExitSideNotJustAnyOutsideClose();
  await testFallbackSwapQuoteMetadataIsExposedOnRebalance();
  await testAeroRewardsUseUint256DeltaAndStakedDenominator();
  await testAeroRowsExposeDilutionSemantics();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
