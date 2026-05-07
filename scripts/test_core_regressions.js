const assert = require("assert/strict");
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

function assertNear(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
}

function testTickPriceRoundTrip() {
  for (const price of [1800, 2450, 3200]) {
    const tick = core.tickForPrice(price);
    const roundTrip = core.priceForTick(tick);
    assertNear(roundTrip, price, price * 1e-12, `price/tick round trip for ${price}`);
  }
}

function testConcentratedLiquidityPlan() {
  const plan = core.computePositionPlan(10000, 2450, 0.01);
  assert.equal(plan.tickLower, -198300, "lower tick should remain spacing-aligned");
  assert.equal(plan.tickUpper, -198200, "upper tick should remain spacing-aligned");
  assert.equal(plan.anchorTick, -198300, "anchor tick should remain spacing-aligned");
  assert.equal(plan.tickUpper - plan.tickLower, 100, "1% range should use one tick-spacing width");
  assertNear(plan.weth, 3.3333815146859016, 1e-12, "initial WETH amount");
  assertNear(plan.usdc, 1833.215289019541, 1e-9, "initial USDC amount");
  assertNear(plan.value, 10000, 1e-9, "initial position value");
  assert.ok(plan.liquidityRaw > 0n, "raw liquidity should be positive");
  assert.ok(core.priceForTick(plan.tickLower) < 2450, "lower range price should be below entry");
  assert.ok(core.priceForTick(plan.tickUpper) > 2450, "upper range price should be above entry");
}

function testRawUnitConversions() {
  assert.equal(core.rawWeth(1.25), 1250000000000000000n, "WETH raw conversion");
  assert.equal(core.rawUsdc(1234.567891), 1234567891n, "USDC raw conversion");
  assertNear(core.rawToWeth(1250000000000000000n), 1.25, 1e-18, "WETH human conversion");
  assertNear(core.rawToUsdc(1234567891n), 1234.567891, 1e-12, "USDC human conversion");
}

function testReliabilityFloors() {
  const result = core.conservativeReliability([
    { label: "block", score: 95, weight: 1 },
    { label: "price", score: 70, weight: 2 },
    { label: "reward", score: 40, weight: 1 },
  ]);
  assert.equal(result.score, 58, "reliability should respect conservative floor");
  assert.equal(result.parts.length, 3, "reliability should keep detail parts");
}

function testAeroUsdcPriceOrder() {
  const sqrtPriceX96 = core.sqrtPriceX96ForPrice(0.85);
  const ratio = (Number(sqrtPriceX96) / Number(2n ** 96n)) ** 2;
  const direct = core.aeroUsdcPriceFromSqrtX96(sqrtPriceX96, {
    token0: "0x940181a94a35a4569e4529a3cdfb74e38fd98631",
    token1: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  });
  const inverse = core.aeroUsdcPriceFromSqrtX96(sqrtPriceX96, {
    token0: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    token1: "0x940181a94a35a4569e4529a3cdfb74e38fd98631",
  });
  assertNear(direct, 0.85, 1e-12, "direct AERO/USDC price");
  assertNear(inverse, 1 / (ratio * 1e-12), 1e9, "inverse token-order decimal adjustment");
}

function testDataQualitySummary() {
  const rows = core.parseCsv([
    "time_open,time_close,open,high,low,close,volume",
    "2026-02-01T00:00:00Z,2026-02-01T00:01:00Z,100,101,99,100,10",
    "2026-02-01T00:02:00Z,2026-02-01T00:03:00Z,0,101,99,100,abc",
    "2026-02-01T00:02:00Z,2026-02-01T00:03:00Z,100,101,99,100,10",
    "2026-02-01T00:05:00Z,2026-02-01T00:06:00Z,105,106,104,105,10",
  ].join("\n"));
  const quality = core.analyzeDataQuality(rows);
  assert.equal(quality.rowCount, 4, "quality row count");
  assert.equal(quality.gapCount, 2, "quality gap count");
  assert.equal(quality.missingMinutes, 3, "quality missing minutes");
  assert.equal(quality.duplicateTimestampCount, 1, "quality duplicate timestamp count");
  assert.equal(quality.outOfOrderCount, 1, "quality out-of-order count");
  assert.equal(quality.zeroPriceCount, 1, "quality zero price count");
  assert.equal(quality.emptyVolumeCount, 1, "quality empty volume count");
}

function testFeeGrowthInsideAccounting() {
  const inside = core.feeGrowthInsideFromState({
    tickLower: -100,
    tickUpper: 100,
    tickCurrent: 0,
    feeGrowthGlobal0X128: 1000n,
    feeGrowthGlobal1X128: 2000n,
    lowerTick: { feeGrowthOutside0X128: 100n, feeGrowthOutside1X128: 300n },
    upperTick: { feeGrowthOutside0X128: 250n, feeGrowthOutside1X128: 400n },
  });
  assert.equal(inside.feeGrowthInside0X128, 650n, "fee growth inside token0 should subtract below and above");
  assert.equal(inside.feeGrowthInside1X128, 1300n, "fee growth inside token1 should subtract below and above");

  const belowRange = core.feeGrowthInsideFromState({
    tickLower: -100,
    tickUpper: 100,
    tickCurrent: -200,
    feeGrowthGlobal0X128: 1000n,
    feeGrowthGlobal1X128: 2000n,
    lowerTick: { feeGrowthOutside0X128: 400n, feeGrowthOutside1X128: 500n },
    upperTick: { feeGrowthOutside0X128: 100n, feeGrowthOutside1X128: 300n },
  });
  assert.equal(belowRange.feeGrowthInside0X128, 300n, "below-range fee growth follows tick outside accounting");
  assert.equal(belowRange.feeGrowthInside1X128, 200n, "below-range token1 fee growth follows tick outside accounting");
}

function testDilutedGrowthDelta() {
  const result = core.applyGrowthDelta({
    liquidityRaw: 100n,
    growthDeltaX128: 10n * (2n ** 128n),
    baseLiquidityRaw: 900n,
    q128: 2n ** 128n,
  });
  assert.equal(result.raw, 900n, "hypothetical liquidity should dilute fee/reward growth by added liquidity share");
  assert.equal(result.dilutionShare, 0.1, "dilution share should expose simulated share of post-add liquidity");
}

testTickPriceRoundTrip();
testConcentratedLiquidityPlan();
testRawUnitConversions();
testReliabilityFloors();
testAeroUsdcPriceOrder();
testDataQualitySummary();
testFeeGrowthInsideAccounting();
testDilutedGrowthDelta();
