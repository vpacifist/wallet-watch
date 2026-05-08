const CSV_FILE = "./weth_usdc_1m_2026_feb_mar_apr.csv";

const state = {
  rows: [],
  visible: [],
  dataQuality: null,
  range: "all",
  hoverIndex: -1,
  zoomStart: 0,
  zoomEnd: 1,
  isDragging: false,
  dragX: 0,
  dragStart: 0,
  dragEnd: 1,
  dragSamples: [],
  dragMin: 0,
  dragMax: 1,
  releaseRows: null,
  dragMoved: false,
  suppressNextClick: false,
  isNavigatorDragging: false,
  navigatorDragX: 0,
  navigatorDragStart: 0,
  activeTimeInput: "start",
  sim: {
    startIndex: 0,
    endIndex: 0,
    currentIndex: 0,
    started: false,
    initializing: false,
    stopped: false,
    autoRunning: false,
    stepInProgress: false,
    fastRenderEveryMs: 500,
    lastFastRenderAt: 0,
    runToken: 0,
    autoLoopId: 0,
    stepDurations: [],
    etaMs: 0,
    depositUsdc: 10000,
    rangeWidth: 0.01,
    tickLower: 0,
    tickUpper: 0,
    liquidityRaw: 0n,
    liquidityHuman: 0,
    anchorTick: 0,
    startGridTick: 0,
    rangeStepTicks: 0,
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
    rows: [],
    blockCache: new Map(),
    aeroPriceCache: new Map(),
    aeroPriceReliability: 100,
    aeroPriceAgeSeconds: 0,
    tableHoverIndex: -1,
    activeRowIndex: -1,
  },
};

const canvas = document.getElementById("priceChart");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");
const simTooltip = document.getElementById("simTooltip");
const tableTooltip = document.getElementById("tableTooltip");
const statusEl = document.getElementById("status");
const rangeNavigator = document.getElementById("rangeNavigator");
const rangeTrack = document.getElementById("rangeTrack");
const rangeWindow = document.getElementById("rangeWindow");
const simStartInput = document.getElementById("simStartInput");
const simEndInput = document.getElementById("simEndInput");
const depositInput = document.getElementById("depositInput");
const rangePercentInput = document.getElementById("rangePercentInput");
const runSimulation = document.getElementById("runSimulation");
const resetSimulationButton = document.getElementById("resetSimulation");
const stepBack = document.getElementById("stepBack");
const stepForward = document.getElementById("stepForward");
const currentPositionValue = document.getElementById("currentPositionValue");
const currentAeroEarned = document.getElementById("currentAeroEarned");
const simNotice = document.getElementById("simNotice");
const simTableWrap = document.getElementById("simTableWrap");
const simTableBody = document.getElementById("simTableBody");
const serverJobs = document.getElementById("serverJobs");
const serverJobsList = document.getElementById("serverJobsList");
const refreshServerJobs = document.getElementById("refreshServerJobs");
const refreshDoneCheck = document.getElementById("refreshDoneCheck");
const appTabNew = document.getElementById("appTabNew");
const appTabHistory = document.getElementById("appTabHistory");
const resultTabs = document.getElementById("resultTabs");
const chartView = document.getElementById("chartView");
const newSimulationView = document.getElementById("newSimulationView");
const historyView = document.getElementById("historyView");
const simulationResultView = document.getElementById("simulationResultView");
const resultTitle = document.getElementById("resultTitle");
const resultSubtitle = document.getElementById("resultSubtitle");
const resultSummary = document.getElementById("resultSummary");
const resultLastRow = document.getElementById("resultLastRow");
const resultTableWrap = document.getElementById("resultTableWrap");
const resultTableBody = document.getElementById("resultTableBody");
const resultEmpty = document.getElementById("resultEmpty");
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const AERODROME_TICK_SPACING = 100;
const PRICE_DECIMAL_FACTOR = 1e12;
const POINTS_PER_PIXEL = 0.55;
const DEFAULT_SIM_RANGE_WIDTH = 0.01;
const RUNTIME_CONFIG = globalThis.SERVER_SIM_CONFIG_CLIENT || {};
const LP_FEE_RATE = Number(RUNTIME_CONFIG.lpFeeRate ?? 0.0005);
const REBALANCE_MANUAL_FEE_BPS = Number(RUNTIME_CONFIG.rebalanceManualFeeBps ?? 1);
const REBALANCE_GAS_UNITS = BigInt(RUNTIME_CONFIG.rebalanceGasUnits ?? 1450000);
const REBALANCE_L1_DATA_FEE_ETH = Number(RUNTIME_CONFIG.rebalanceL1DataFeeEth ?? 0.000012);
const REBALANCE_FALLBACK_SLIPPAGE_BPS = Number(RUNTIME_CONFIG.rebalanceFallbackSlippageBps ?? 5);
const AERO_IMPACT_HAIRCUT_MAX = Number(RUNTIME_CONFIG.aeroImpactHaircutMax ?? 0.5);
const SERVER_SIMULATION_POLL_MS = Number(RUNTIME_CONFIG.serverSimulationPollMs ?? 2500);
const BASE_RPC_URLS = ["/rpc"];
const SERVER_SIMULATION_MODE = !new URLSearchParams(window.location.search).has("local-sim");
let baseRpcIndex = 0;
const POOL_ADDRESS = "0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59";
const AERO_USDC_POOL_ADDRESS = "0xbe00ff35af70e8415d0eb605a286d8a45466a4c1";
const AERO_SLIPSTREAM_QUOTER = "0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0";
const AERO_ADDRESS = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SWAP_TOPIC = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
const BASE_BLOCK_ANCHOR = { number: 41557327, timestamp: 1769904001 };
const BASE_SECONDS_PER_BLOCK = 2;
const Q96 = 2n ** 96n;
const Q128 = 2n ** 128n;
const AERO_DECIMALS = 10n ** 18n;
const WETH_DECIMALS = 10n ** 18n;
const USDC_DECIMALS = 10n ** 6n;
const SELECTORS = {
  slot0: "0x3850c7bd",
  rewardGrowthGlobal: "0x57806ada",
  rewardRate: "0x7b0a47ee",
  rewardReserve: "0xcab64bcd",
  lastUpdated: "0xd0b06f5d",
  stakedLiquidity: "0x3ab04b20",
  liquidity: "0x1a686502",
  fee: "0xddca3f43",
  feeGrowthGlobal0X128: "0xf3058399",
  feeGrowthGlobal1X128: "0x46141319",
  ticks: "0xf30dba93",
  getRewardGrowthInside: "0xa16368c9",
  quoteExactInputSingle: "0xf7729d43",
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
};
let aeroUsdcTokenOrder = null;
const serverSimulation = {
  id: null,
  pollTimer: null,
  pollBackoffMs: 0,
  eventSource: null,
  running: false,
  paused: false,
  available: SERVER_SIMULATION_MODE,
  jobs: [],
  rawRows: [],
  startedAtMs: 0,
};
const appTabs = {
  active: "new",
  results: new Map(),
};

const {
  addUtcDays,
  addUtcHours,
  addressFromWord,
  analyzeDataQuality: analyzeRowsDataQuality,
  aeroPriceReliability,
  aeroUsdcPriceFromSqrtX96,
  blockTag,
  buildCompleteMinuteRows,
  blockTimeReliability,
  clampPercent,
  computePositionPlan,
  computePositionPlanForRange,
  conservativeReliability,
  encodeAddress,
  encodeInt24,
  encodeUint256,
  fmtAxisHour,
  fmtAxisTime,
  fmtDeposit,
  fmtInputTime,
  fmtNumber,
  fmtPercent,
  fmtPrice,
  fmtReliability,
  fmtTime,
  fmtUsdc,
  hexToBigInt,
  parseCsv,
  parseInputTime,
  parseNumericInput,
  parseRangePercent,
  priceAgreementReliability,
  priceBounds,
  priceForTick,
  priceFromSqrtX96,
  rawToUsdc,
  rawToWeth,
  rawUsdc,
  rawWeth,
  reliabilityDetailsText,
  rewardStateReliability,
  scoreFromThresholds,
  feeGrowthInsideFromState,
  growthDeltaIn256,
  applyGrowthDelta,
  normalizeSourceLabel,
  findBlockAtOrAfterWithGetter,
  sqrtPriceX96ForPrice,
  startOfUtcDay,
  tickRangeAroundTick,
  tickForPrice,
  toSignedWord,
  wordAt,
} = WalletWatchCore.create({
  MONTHS_SHORT,
  AERODROME_TICK_SPACING,
  PRICE_DECIMAL_FACTOR,
  Q96,
  Q128,
  WETH_DECIMALS,
  USDC_DECIMALS,
  AERO_ADDRESS,
  USDC_ADDRESS,
});

function setMetric(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function updateMetrics(rows) {
  if (!rows.length) return;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const bounds = priceBounds(rows);
  setMetric("rowCount", rows.length.toLocaleString("en-US"));
  setMetric("firstPrice", fmtPrice(first.close));
  setMetric("lastPrice", fmtPrice(last.close));
  setMetric("priceRange", `${fmtPrice(bounds.min)} - ${fmtPrice(bounds.max)}`);
}

function chartPriceBounds(rows) {
  const bounds = priceBounds(rows);
  if (state.sim.started) {
    const prices = simRangePrices();
    bounds.min = Math.min(bounds.min, prices.lower);
    bounds.max = Math.max(bounds.max, prices.upper);
  }
  return bounds;
}

async function rpcCall(method, params) {
  let lastError = null;
  for (let attempt = 0; attempt < BASE_RPC_URLS.length; attempt += 1) {
    const url = BASE_RPC_URLS[baseRpcIndex % BASE_RPC_URLS.length];
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!response.ok) throw new Error(`Base RPC HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error.message || "Base RPC error");
      return payload.result;
    } catch (error) {
      lastError = error;
      baseRpcIndex += 1;
    }
  }
  throw lastError || new Error("Base RPC error");
}

async function rpcBatch(calls) {
  let lastError = null;
  for (let attempt = 0; attempt < BASE_RPC_URLS.length; attempt += 1) {
    const url = BASE_RPC_URLS[baseRpcIndex % BASE_RPC_URLS.length];
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(calls.map((call, index) => ({ jsonrpc: "2.0", id: index + 1, ...call }))),
      });
      if (!response.ok) throw new Error(`Base RPC HTTP ${response.status}`);
      const payload = await response.json();
      const byId = new Map(payload.map((item) => [item.id, item]));
      return calls.map((_, index) => {
        const item = byId.get(index + 1);
        if (!item || item.error) throw new Error(item?.error?.message || "Base RPC batch error");
        return item.result;
      });
    } catch (error) {
      lastError = error;
      baseRpcIndex += 1;
    }
  }
  throw lastError || new Error("Base RPC batch error");
}

async function getBlock(blockNumber) {
  const block = await rpcCall("eth_getBlockByNumber", [blockTag(blockNumber), false]);
  return {
    number: Number(BigInt(block.number)),
    timestamp: Number(BigInt(block.timestamp)),
    baseFeePerGas: block.baseFeePerGas ? BigInt(block.baseFeePerGas) : 0n,
  };
}

async function latestBlockNumber() {
  return Number(BigInt(await rpcCall("eth_blockNumber", [])));
}

async function findBlockAtOrAfter(timestampSeconds, afterBlock = 1) {
  return await findBlockAtOrAfterWithGetter({
    timestampSeconds,
    afterBlock,
    anchor: BASE_BLOCK_ANCHOR,
    secondsPerBlock: BASE_SECONDS_PER_BLOCK,
    getBlock,
    cache: state.sim.blockCache,
  });
}

function decodeSlot0(data) {
  return {
    sqrtPriceX96: hexToBigInt(`0x${wordAt(data, 0)}`),
    tick: Number(toSignedWord(wordAt(data, 1))),
  };
}

function decodeTickInfo(data) {
  return {
    liquidityGross: hexToBigInt(`0x${wordAt(data, 0)}`),
    liquidityNet: toSignedWord(wordAt(data, 1)),
    stakedLiquidityNet: toSignedWord(wordAt(data, 2)),
    feeGrowthOutside0X128: hexToBigInt(`0x${wordAt(data, 3)}`),
    feeGrowthOutside1X128: hexToBigInt(`0x${wordAt(data, 4)}`),
    rewardGrowthOutsideX128: hexToBigInt(`0x${wordAt(data, 5)}`),
    initialized: hexToBigInt(`0x${wordAt(data, 9)}`) !== 0n,
  };
}

async function readPoolSlot0(poolAddress, blockNumber) {
  const data = await rpcCall("eth_call", [{ to: poolAddress, data: SELECTORS.slot0 }, blockTag(blockNumber)]);
  return decodeSlot0(data);
}

async function readRewardInside(blockNumber, tickLower, tickUpper) {
  const tag = blockTag(blockNumber);
  const tickLowerData = `${SELECTORS.ticks}${encodeInt24(tickLower)}`;
  const tickUpperData = `${SELECTORS.ticks}${encodeInt24(tickUpper)}`;
  const [slotData, globalData, rateData, reserveData, lastUpdatedData, stakedData, activeLiquidityData, feeData, feeGlobal0Data, feeGlobal1Data, lowerTickData, upperTickData] = await rpcBatch([
    { method: "eth_call", params: [{ to: POOL_ADDRESS, data: SELECTORS.slot0 }, tag] },
    { method: "eth_call", params: [{ to: POOL_ADDRESS, data: SELECTORS.rewardGrowthGlobal }, tag] },
    { method: "eth_call", params: [{ to: POOL_ADDRESS, data: SELECTORS.rewardRate }, tag] },
    { method: "eth_call", params: [{ to: POOL_ADDRESS, data: SELECTORS.rewardReserve }, tag] },
    { method: "eth_call", params: [{ to: POOL_ADDRESS, data: SELECTORS.lastUpdated }, tag] },
    { method: "eth_call", params: [{ to: POOL_ADDRESS, data: SELECTORS.stakedLiquidity }, tag] },
    { method: "eth_call", params: [{ to: POOL_ADDRESS, data: SELECTORS.liquidity }, tag] },
    { method: "eth_call", params: [{ to: POOL_ADDRESS, data: SELECTORS.fee }, tag] },
    { method: "eth_call", params: [{ to: POOL_ADDRESS, data: SELECTORS.feeGrowthGlobal0X128 }, tag] },
    { method: "eth_call", params: [{ to: POOL_ADDRESS, data: SELECTORS.feeGrowthGlobal1X128 }, tag] },
    { method: "eth_call", params: [{ to: POOL_ADDRESS, data: tickLowerData }, tag] },
    { method: "eth_call", params: [{ to: POOL_ADDRESS, data: tickUpperData }, tag] },
  ]);
  const block = await getBlock(blockNumber);
  const slot = decodeSlot0(slotData);
  const storedGlobal = hexToBigInt(globalData);
  const rewardRate = hexToBigInt(rateData);
  const rewardReserve = hexToBigInt(reserveData);
  const lastUpdated = hexToBigInt(lastUpdatedData);
  const stakedLiquidity = hexToBigInt(stakedData);
  const activeLiquidity = hexToBigInt(activeLiquidityData);
  const feeRate = Number(hexToBigInt(feeData)) / 1_000_000;
  const feeGrowthGlobal0X128 = hexToBigInt(feeGlobal0Data);
  const feeGrowthGlobal1X128 = hexToBigInt(feeGlobal1Data);
  const lowerTick = decodeTickInfo(lowerTickData);
  const upperTick = decodeTickInfo(upperTickData);
  const feeGrowthInside = feeGrowthInsideFromState({
    tickLower,
    tickUpper,
    tickCurrent: slot.tick,
    feeGrowthGlobal0X128,
    feeGrowthGlobal1X128,
    lowerTick,
    upperTick,
  });
  const rewardElapsedSeconds = Math.max(0, block.timestamp - Number(lastUpdated));
  const elapsed = BigInt(rewardElapsedSeconds);
  const expectedReward = rewardRate * elapsed;
  let reward = expectedReward;
  if (reward > rewardReserve) reward = rewardReserve;
  const calculatedGlobal = stakedLiquidity > 0n ? storedGlobal + reward * Q128 / stakedLiquidity : storedGlobal;
  const data = `${SELECTORS.getRewardGrowthInside}${encodeInt24(tickLower)}${encodeInt24(tickUpper)}${encodeUint256(calculatedGlobal)}`;
  const rewardInside = hexToBigInt(await rpcCall("eth_call", [{ to: POOL_ADDRESS, data }, tag]));
  return {
    rewardInside,
    stakedLiquidity,
    activeLiquidity,
    tick: slot.tick,
    sqrtPriceX96: slot.sqrtPriceX96,
    block,
    rewardElapsedSeconds,
    rewardReserveCapped: expectedReward > rewardReserve,
    feeRate,
    feeGrowthGlobal0X128,
    feeGrowthGlobal1X128,
    ...feeGrowthInside,
  };
}

async function getAeroUsdcTokenOrder(blockNumber) {
  if (aeroUsdcTokenOrder) return aeroUsdcTokenOrder;
  const [token0Data, token1Data] = await rpcBatch([
    { method: "eth_call", params: [{ to: AERO_USDC_POOL_ADDRESS, data: SELECTORS.token0 }, blockTag(blockNumber)] },
    { method: "eth_call", params: [{ to: AERO_USDC_POOL_ADDRESS, data: SELECTORS.token1 }, blockTag(blockNumber)] },
  ]);
  aeroUsdcTokenOrder = {
    token0: addressFromWord(token0Data),
    token1: addressFromWord(token1Data),
  };
  return aeroUsdcTokenOrder;
}

async function getAeroPrice(blockNumber) {
  const cached = state.sim.aeroPriceCache.get(blockNumber);
  if (cached) {
    state.sim.aeroPriceReliability = cached.reliability;
    state.sim.aeroPriceAgeSeconds = 0;
    return cached.price;
  }
  try {
    const [slot, tokenOrder] = await Promise.all([
      readPoolSlot0(AERO_USDC_POOL_ADDRESS, blockNumber),
      getAeroUsdcTokenOrder(blockNumber),
    ]);
    const price = aeroUsdcPriceFromSqrtX96(slot.sqrtPriceX96, tokenOrder);
    if (!Number.isFinite(price) || price <= 0) throw new Error("Не удалось получить on-chain цену AERO");
    const reliability = 96;
    state.sim.aeroPriceCache.set(blockNumber, { price, reliability });
    state.sim.aeroPriceReliability = reliability;
    state.sim.aeroPriceAgeSeconds = 0;
    return price;
  } catch (error) {
    let nearest = null;
    let nearestBlockDistance = Number.POSITIVE_INFINITY;
    for (const [cachedBlock, cachedPrice] of state.sim.aeroPriceCache.entries()) {
      const distance = Math.abs(cachedBlock - blockNumber);
      if (distance < nearestBlockDistance) {
        nearest = cachedPrice;
        nearestBlockDistance = distance;
      }
    }
    if (nearest !== null) {
      const ageSeconds = nearestBlockDistance * BASE_SECONDS_PER_BLOCK;
      state.sim.aeroPriceReliability = Math.min(nearest.reliability, aeroPriceReliability(ageSeconds) - 8);
      state.sim.aeroPriceAgeSeconds = ageSeconds;
      return nearest.price;
    }
    throw error;
  }
}

async function findSwapExit(fromBlock, toBlock, tickLower, tickUpper) {
  if (toBlock < fromBlock) return null;
  const logs = await getSwapLogs(fromBlock, toBlock);
  for (const log of logs) {
    const tick = Number(toSignedWord(wordAt(log.data, 4)));
    if (tick < tickLower || tick >= tickUpper) {
      return {
        blockNumber: Number(BigInt(log.blockNumber)),
        logIndex: Number(BigInt(log.logIndex)),
        tick,
        sqrtPriceX96: hexToBigInt(`0x${wordAt(log.data, 2)}`),
      };
    }
  }
  return null;
}

async function getSwapLogs(fromBlock, toBlock) {
  if (toBlock < fromBlock) return [];
  const logs = await rpcCall("eth_getLogs", [{
    address: POOL_ADDRESS,
    fromBlock: blockTag(fromBlock),
    toBlock: blockTag(toBlock),
    topics: [SWAP_TOPIC],
  }]);
  return [...(logs || [])].sort((left, right) => {
    const leftBlock = Number(BigInt(left.blockNumber));
    const rightBlock = Number(BigInt(right.blockNumber));
    if (leftBlock !== rightBlock) return leftBlock - rightBlock;
    const leftTx = Number(BigInt(left.transactionIndex || "0x0"));
    const rightTx = Number(BigInt(right.transactionIndex || "0x0"));
    if (leftTx !== rightTx) return leftTx - rightTx;
    return Number(BigInt(left.logIndex || "0x0")) - Number(BigInt(right.logIndex || "0x0"));
  });
}

function decodeSwapLog(log) {
  return {
    blockNumber: Number(BigInt(log.blockNumber)),
    logIndex: Number(BigInt(log.logIndex)),
    amount0: toSignedWord(wordAt(log.data, 0)),
    amount1: toSignedWord(wordAt(log.data, 1)),
    sqrtPriceX96: hexToBigInt(`0x${wordAt(log.data, 2)}`),
    liquidity: hexToBigInt(`0x${wordAt(log.data, 3)}`),
    tick: Number(toSignedWord(wordAt(log.data, 4))),
  };
}

async function estimateLpFees(fromBlock, toBlock, rewardState, price) {
  if (toBlock < fromBlock || state.sim.liquidityRaw <= 0n) {
    return { weth: 0, usdc: 0, usdcValue: 0, source: "no-block-range", sourceLabel: "exact-onchain", reliability: 100, swapCount: 0 };
  }
  if (rewardState.feeGrowthInside0X128 !== undefined && rewardState.feeGrowthInside1X128 !== undefined) {
    let logs = [];
    if (rewardState.rangeCrossed) {
      try {
        logs = await getSwapLogs(fromBlock, toBlock);
      } catch (_) {
        logs = [];
      }
    }
    const inRangeLogs = logs.map(decodeSwapLog).filter((swap) => swap.tick >= state.sim.tickLower && swap.tick < state.sim.tickUpper);
    const crossedRange = logs.some((log) => {
      const swap = decodeSwapLog(log);
      return swap.tick < state.sim.tickLower || swap.tick >= state.sim.tickUpper;
    }) && inRangeLogs.length > 0;
    const delta0 = growthDeltaIn256(rewardState.feeGrowthInside0X128, state.sim.feeGrowthInside0Last);
    const delta1 = growthDeltaIn256(rewardState.feeGrowthInside1X128, state.sim.feeGrowthInside1Last);
    const activeNow = rewardState.tick >= state.sim.tickLower && rewardState.tick < state.sim.tickUpper
      ? rewardState.activeLiquidity
      : 0n;
    const previousActive = state.sim.feeDilutionLiquidityLast || 0n;
    const logLiquidity = inRangeLogs.reduce((sum, swap) => sum + (swap.liquidity > 0n ? swap.liquidity : 0n), 0n);
    const logBaseLiquidity = inRangeLogs.length ? logLiquidity / BigInt(inRangeLogs.length) : 0n;
    const endpointBaseLiquidity = activeNow > 0n && previousActive > 0n
      ? (activeNow + previousActive) / 2n
      : (activeNow > 0n ? activeNow : previousActive);
    const baseLiquidity = logBaseLiquidity > 0n ? logBaseLiquidity : endpointBaseLiquidity;
    const fee0 = applyGrowthDelta({
      liquidityRaw: state.sim.liquidityRaw,
      growthDeltaX128: delta0,
      baseLiquidityRaw: baseLiquidity,
      q128: Q128,
    });
    const fee1 = applyGrowthDelta({
      liquidityRaw: state.sim.liquidityRaw,
      growthDeltaX128: delta1,
      baseLiquidityRaw: baseLiquidity,
      q128: Q128,
    });
    state.sim.feeGrowthInside0Last = rewardState.feeGrowthInside0X128;
    state.sim.feeGrowthInside1Last = rewardState.feeGrowthInside1X128;
    state.sim.feeDilutionLiquidityLast = activeNow;
    return {
      weth: rawToWeth(fee0.raw),
      usdc: rawToUsdc(fee1.raw),
      usdcValue: rawToWeth(fee0.raw) * price + rawToUsdc(fee1.raw),
      source: crossedRange ? "feeGrowthInside-subinterval-diluted" : "feeGrowthInside-diluted",
      sourceLabel: "counterfactual-adjusted",
      reliability: baseLiquidity > 0n ? (crossedRange ? 94 : 92) : 76,
      swapCount: logs.length,
      rangeCrossed: crossedRange,
      dilutionShare: Math.max(fee0.dilutionShare, fee1.dilutionShare),
    };
  }
  const logs = await getSwapLogs(fromBlock, toBlock);
  let weth = 0;
  let usdc = 0;
  let swapCount = 0;
  for (const log of logs) {
    const swap = decodeSwapLog(log);
    if (swap.tick < state.sim.tickLower || swap.tick >= state.sim.tickUpper) continue;
    const activeLiquidity = swap.liquidity > 0n ? swap.liquidity : rewardState.activeLiquidity;
    const totalLiquidity = activeLiquidity + state.sim.liquidityRaw;
    if (totalLiquidity <= 0n) continue;
    const share = Number(state.sim.liquidityRaw * 1000000n / totalLiquidity) / 1000000;
    if (swap.amount0 > 0n) weth += rawToWeth(swap.amount0) * LP_FEE_RATE * share;
    if (swap.amount1 > 0n) usdc += rawToUsdc(swap.amount1) * LP_FEE_RATE * share;
    swapCount += 1;
  }
  return {
    weth,
    usdc,
    usdcValue: weth * price + usdc,
    source: "estimated-from-swap-logs",
    sourceLabel: "estimated",
    reliability: swapCount ? 68 : 92,
    swapCount,
  };
}

async function quoteAerodromeSwap(tokenIn, tokenOut, amountInRaw, blockNumber) {
  if (amountInRaw <= 0n) return { amountOutRaw: 0n, source: "no-swap", reliability: 100, sourceLabel: "exact-onchain" };
  const validPair = new Set([tokenIn.toLowerCase(), tokenOut.toLowerCase()]);
  if (!validPair.has(WETH_ADDRESS.toLowerCase()) || !validPair.has(USDC_ADDRESS.toLowerCase())) {
    return { amountOutRaw: 0n, source: "invalid-token-pair", reliability: 0, sourceLabel: "fallback", failureReason: "token order/pair validation failed" };
  }
  const data = `${SELECTORS.quoteExactInputSingle}${encodeAddress(tokenIn)}${encodeAddress(tokenOut)}${encodeUint256(AERODROME_TICK_SPACING)}${encodeUint256(amountInRaw)}${encodeUint256(0)}`;
  let failureReason = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await rpcCall("eth_call", [{ to: AERO_SLIPSTREAM_QUOTER, data }, blockTag(blockNumber)]);
      return { amountOutRaw: hexToBigInt(`0x${wordAt(result, 0)}`), source: "aerodrome-quoter", reliability: 94, sourceLabel: "reconstructed-onchain", attempts: attempt };
    } catch (error) {
      failureReason = error.message || "quoter eth_call failed";
    }
  }
  return { amountOutRaw: 0n, source: "fallback", reliability: 50, sourceLabel: "fallback", failureReason, attempts: 2 };
}

function fallbackSwapQuote(swap, price, direction, failureReason) {
  if (direction === "WETH_TO_USDC") {
    const outputAmount = swap.amount * price * (1 - REBALANCE_FALLBACK_SLIPPAGE_BPS / 10000);
    return { outputAmount, lossUsdc: swap.amount * price - outputAmount, source: "fallback", sourceLabel: "fallback", reliability: 50, failureReason };
  }
  const outputAmount = swap.amount / price * (1 - REBALANCE_FALLBACK_SLIPPAGE_BPS / 10000);
  return { outputAmount, lossUsdc: swap.amount - outputAmount * price, source: "fallback", sourceLabel: "fallback", reliability: 50, failureReason };
}

async function estimateHistoricalSwap(swap, price, blockNumber) {
  if (swap.amount <= 0) {
    return { outputAmount: 0, lossUsdc: 0, source: "no-swap", sourceLabel: "exact-onchain", reliability: 100 };
  }
  if (swap.direction === "WETH_TO_USDC") {
    const amountInRaw = rawWeth(swap.amount);
    const quote = await quoteAerodromeSwap(WETH_ADDRESS, USDC_ADDRESS, amountInRaw, blockNumber);
    if (quote.source !== "fallback") {
      const outputAmount = rawToUsdc(quote.amountOutRaw);
      return {
        outputAmount,
        lossUsdc: Math.max(0, swap.amount * price - outputAmount),
        source: quote.source,
        sourceLabel: quote.sourceLabel,
        reliability: quote.reliability,
        quoteAttempts: quote.attempts,
      };
    }
    return fallbackSwapQuote(swap, price, "WETH_TO_USDC", quote.failureReason);
  }
  const amountInRaw = rawUsdc(swap.amount);
  const quote = await quoteAerodromeSwap(USDC_ADDRESS, WETH_ADDRESS, amountInRaw, blockNumber);
  if (quote.source !== "fallback") {
    const outputAmount = rawToWeth(quote.amountOutRaw);
    return {
      outputAmount,
      lossUsdc: Math.max(0, swap.amount - outputAmount * price),
      source: quote.source,
      sourceLabel: quote.sourceLabel,
      reliability: quote.reliability,
      quoteAttempts: quote.attempts,
    };
  }
  return fallbackSwapQuote(swap, price, "USDC_TO_WETH", quote.failureReason);
}

async function buildRebalanceRow(index, exit, block, runToken = null) {
  return await simulationEngine.buildRebalanceRow(index, exit, block, runToken);
}

function snapshotSimState() {
  return simulationEngine.snapshotState();
}

function applySimState(snapshot) {
  return simulationEngine.applyState(snapshot, DEFAULT_SIM_RANGE_WIDTH);
}

function simRangePrices() {
  return {
    lower: priceForTick(state.sim.tickLower),
    upper: priceForTick(state.sim.tickUpper),
  };
}

function simRangeText() {
  const prices = simRangePrices();
  return `Диапазон ${fmtPercent(state.sim.rangeWidth * 100)}%: ${fmtPrice(prices.lower)} — ${fmtPrice(prices.upper)} (ticks ${Math.abs(state.sim.tickLower)} — ${Math.abs(state.sim.tickUpper)})`;
}

function simulationRangeGridPrices(min, max) {
  if (!state.sim.started || !state.sim.rangeStepTicks) return [];
  const start = state.sim.startGridTick || state.sim.tickLower;
  const step = Math.max(AERODROME_TICK_SPACING, state.sim.rangeStepTicks);
  const minTick = tickForPrice(min);
  const maxTick = tickForPrice(max);
  const firstIndex = Math.floor((minTick - start) / step) - 1;
  const lastIndex = Math.ceil((maxTick - start) / step) + 1;
  const boundaries = [];
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const tick = start + index * step;
    const price = priceForTick(tick);
    if (price >= min && price <= max) boundaries.push({ tick, price, index });
  }
  return boundaries;
}

function downsample(rows, maxPoints) {
  if (rows.length <= maxPoints) return rows;
  const step = (rows.length - 1) / (maxPoints - 1);
  const result = [];
  for (let i = 0; i < maxPoints; i += 1) {
    result.push(rows[Math.round(i * step)]);
  }
  return result;
}

function getRangeRows() {
  if (state.range === "all") return state.rows;
  return state.rows.filter((row) => row.time.startsWith(state.range));
}

function getVisibleRows() {
  const rows = getRangeRows();
  if (rows.length <= 1) return rows;
  const start = Math.floor(state.zoomStart * (rows.length - 1));
  const end = Math.ceil(state.zoomEnd * (rows.length - 1)) + 1;
  return rows.slice(start, Math.max(start + 2, end));
}

function getRenderedRows() {
  if (state.releaseRows) return state.releaseRows;
  return downsample(getVisibleRows(), Math.floor(canvas.clientWidth * POINTS_PER_PIXEL));
}

function buildDragSamples() {
  const rows = getRangeRows();
  if (rows.length <= 1 || !state.visible.length) return [];

  const firstVisibleIndex = state.visible[0].index;
  const lastVisibleIndex = state.visible[state.visible.length - 1].index;
  const firstRangeIndex = rows[0].index;
  const rangeSpan = Math.max(1, rows[rows.length - 1].index - firstRangeIndex);
  const visibleStart = rows.findIndex((row) => row.index >= firstVisibleIndex);
  const visibleEnd = rows.findIndex((row) => row.index >= lastVisibleIndex);
  const visibleSpan = Math.max(1, visibleEnd - visibleStart);
  const pointsPerRow = state.visible.length / visibleSpan;
  const padSpan = visibleSpan * 6;

  const sampleSegment = (start, end) => {
    if (end < start) return [];
    const length = end - start + 1;
    const count = Math.max(2, Math.ceil(length * pointsPerRow));
    const step = length <= 1 ? 1 : (length - 1) / (count - 1);
    const result = [];
    for (let i = 0; i < count; i += 1) {
      result.push(rows[Math.round(start + i * step)]);
    }
    return result;
  };

  const left = sampleSegment(Math.max(0, visibleStart - padSpan), visibleStart - 1);
  const right = sampleSegment(visibleEnd + 1, Math.min(rows.length - 1, visibleEnd + padSpan));
  const byIndex = new Map();
  [...left, ...state.visible, ...right].forEach((row) => {
    byIndex.set(row.index, {
      row,
      ratio: (row.index - firstRangeIndex) / rangeSpan,
    });
  });

  return [...byIndex.values()].sort((a, b) => a.ratio - b.ratio);
}

function getVisibleDragRows() {
  const rows = state.dragSamples
    .filter((sample) => sample.ratio >= state.zoomStart && sample.ratio <= state.zoomEnd)
    .map((sample) => sample.row);
  return rows.length ? rows : state.dragSamples.map((sample) => sample.row);
}

function zoomAt(ratio, direction) {
  const rows = getRangeRows();
  if (rows.length <= 2) return;

  const currentStart = state.zoomStart;
  const currentEnd = state.zoomEnd;
  const currentSize = currentEnd - currentStart;
  const factor = direction < 0 ? 0.75 : 1.35;
  const minSize = Math.min(1, 120 / rows.length);
  const nextSize = Math.min(1, Math.max(minSize, currentSize * factor));
  const anchor = currentStart + ratio * currentSize;
  let nextStart = anchor - ratio * nextSize;
  let nextEnd = nextStart + nextSize;

  if (nextStart < 0) {
    nextStart = 0;
    nextEnd = nextSize;
  }
  if (nextEnd > 1) {
    nextEnd = 1;
    nextStart = 1 - nextSize;
  }

  state.zoomStart = nextStart;
  state.zoomEnd = nextEnd;
  state.releaseRows = null;
}

function panBy(deltaRatio) {
  const currentSize = state.zoomEnd - state.zoomStart;
  if (currentSize >= 1) return;

  let nextStart = state.dragStart + deltaRatio;
  let nextEnd = state.dragEnd + deltaRatio;
  if (nextStart < 0) {
    nextStart = 0;
    nextEnd = currentSize;
  }
  if (nextEnd > 1) {
    nextEnd = 1;
    nextStart = 1 - currentSize;
  }

  state.zoomStart = nextStart;
  state.zoomEnd = nextEnd;
}

function setZoomWindow(start) {
  const size = state.zoomEnd - state.zoomStart;
  if (size >= 1) return;
  const nextStart = Math.min(Math.max(start, 0), 1 - size);
  state.zoomStart = nextStart;
  state.zoomEnd = nextStart + size;
  state.releaseRows = null;
  state.hoverIndex = -1;
  updateMetrics(getVisibleRows());
  draw();
}

function updateNavigator() {
  if (!rangeNavigator || !rangeWindow) return;
  const rangeRows = getRangeRows();
  const size = Math.min(1, Math.max(0, state.zoomEnd - state.zoomStart));
  rangeNavigator.classList.toggle("disabled", rangeRows.length <= 1 || size >= 1);
  rangeWindow.style.left = `${state.zoomStart * 100}%`;
  rangeWindow.style.width = `${size * 100}%`;
  rangeWindow.setAttribute("aria-valuenow", String(Math.round(state.zoomStart * 100)));
  rangeWindow.setAttribute("aria-valuetext", `${Math.round(state.zoomStart * 100)}-${Math.round(state.zoomEnd * 100)}%`);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

function draw() {
  resizeCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const pad = { top: 22, right: 72, bottom: 38, left: 72 };
  ctx.clearRect(0, 0, width, height);

  const visibleRows = getVisibleRows();
  const isDragRender = state.isDragging && state.dragSamples.length > 1;
  const rows = isDragRender ? state.dragSamples.map((sample) => sample.row) : getRenderedRows();
  state.visible = rows;
  updateNavigator();

  if (!rows.length) return;

  const bounds = chartPriceBounds(isDragRender ? getVisibleDragRows() : rows);
  const { min, max } = bounds;
  const span = max - min || 1;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const firstTime = new Date(visibleRows[0].time).getTime();
  const lastTime = new Date(visibleRows[visibleRows.length - 1].time).getTime();
  const rangeRows = getRangeRows();
  const firstRangeIndex = rangeRows[0]?.index ?? 0;
  const rangeIndexSpan = Math.max(1, (rangeRows[rangeRows.length - 1]?.index ?? firstRangeIndex) - firstRangeIndex);
  const xFor = (i) => {
    const ratioInRange = isDragRender
      ? state.dragSamples[i].ratio
      : (rows[i].index - firstRangeIndex) / rangeIndexSpan;
    const ratio = (ratioInRange - state.zoomStart) / Math.max(0.000001, state.zoomEnd - state.zoomStart);
    return pad.left + ratio * plotW;
  };
  const yFor = (price) => pad.top + (1 - (price - min) / span) * plotH;
  const xForTime = (timestamp) => pad.left + ((timestamp - firstTime) / Math.max(1, lastTime - firstTime)) * plotW;
  const visibleDays = (lastTime - firstTime) / (24 * 60 * 60 * 1000);

  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, plotW, plotH);
  ctx.clip();
  const firstDay = startOfUtcDay(new Date(firstTime));
  const dayTicks = [];
  const weekTicks = [];
  const middayTicks = [];
  const labeledHourTicks = [];
  const allHourTicks = [];
  for (let timestamp = firstDay; timestamp <= lastTime; timestamp = addUtcDays(timestamp, 1)) {
    const date = new Date(timestamp);
    const isMonth = date.getUTCDate() === 1;
    const isWeek = date.getUTCDay() === 1;
    if (timestamp >= firstTime) {
      dayTicks.push(timestamp);
      if (isWeek) weekTicks.push(timestamp);
      const x = xForTime(timestamp);
      ctx.strokeStyle = isMonth ? "rgba(23, 32, 51, 0.24)" : isWeek ? "rgba(23, 32, 51, 0.16)" : "rgba(23, 32, 51, 0.1)";
      ctx.lineWidth = visibleDays < 7 ? (isMonth ? 2.2 : isWeek ? 1.8 : 1.55) : (isMonth ? 1.5 : isWeek ? 1.1 : 0.75);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, height - pad.bottom);
      ctx.stroke();
    }

    if (visibleDays < 1 && timestamp >= firstTime && timestamp <= lastTime) {
      allHourTicks.push(timestamp);
    }

    const midday = addUtcHours(timestamp, 12);
    if (visibleDays >= 3 && visibleDays < 7 && midday >= firstTime && midday <= lastTime) {
      middayTicks.push(midday);
      const x = xForTime(midday);
      ctx.strokeStyle = "rgba(242, 95, 92, 0.18)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, height - pad.bottom);
      ctx.stroke();
    }

    for (let hour = 1; hour < 24; hour += 1) {
      const hourTick = addUtcHours(timestamp, hour);
      if (visibleDays < 3 && hourTick >= firstTime && hourTick <= lastTime) {
        if (visibleDays < 1) allHourTicks.push(hourTick);
        if (hour === 6 || hour === 12 || hour === 18) labeledHourTicks.push(hourTick);
        const x = xForTime(hourTick);
        ctx.strokeStyle = hour === 6 || hour === 12 || hour === 18 ? "rgba(242, 95, 92, 0.14)" : "rgba(23, 32, 51, 0.07)";
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, height - pad.bottom);
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  ctx.fillStyle = "#647087";
  ctx.font = "12px Inter, system-ui, sans-serif";
  const boundaries = simulationRangeGridPrices(min, max);
  const shouldLabelAllPriceLines = boundaries.length > 0 && Math.max(1, boundaries.length - 1) < 10;
  boundaries.forEach(({ index, price }) => {
    const y = yFor(price);
    const isMajor = index % 5 === 0;
    ctx.strokeStyle = isMajor ? "rgba(15, 139, 141, 0.34)" : "rgba(15, 139, 141, 0.15)";
    ctx.lineWidth = isMajor ? 1 : 0.75;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    if (isMajor || shouldLabelAllPriceLines) {
      ctx.fillStyle = "#647087";
      ctx.fillText(fmtPrice(price), width - pad.right + 12, y + 4);
    }
  });
  if (state.sim.started) {
    const activeBounds = [
      { label: "lower", tick: state.sim.tickLower, price: priceForTick(state.sim.tickLower), color: "rgba(242, 95, 92, 0.9)" },
      { label: "upper", tick: state.sim.tickUpper, price: priceForTick(state.sim.tickUpper), color: "rgba(242, 95, 92, 0.9)" },
    ]
      .filter(({ price }) => price >= min && price <= max)
      .map((bound) => ({ ...bound, y: yFor(bound.price) }));
    const activeBoundsAreTight = activeBounds.length === 2 && Math.abs(activeBounds[0].y - activeBounds[1].y) < 34;
    activeBounds.forEach(({ label, price, color, y }) => {
      if (price < min || price > max) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const text = `${label} ${fmtPrice(price)}`;
      const textWidth = ctx.measureText(text).width;
      const labelX = width - pad.right - textWidth - 8;
      const preferredLabelY = activeBoundsAreTight && label === "lower" ? y + 16 : y - 6;
      const labelY = Math.max(pad.top + 13, Math.min(height - pad.bottom - 4, preferredLabelY));
      ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
      ctx.fillRect(labelX - 4, labelY - 11, textWidth + 8, 15);
      ctx.fillStyle = "#f25f5c";
      ctx.fillText(text, labelX, labelY);
    });
  }
  const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  gradient.addColorStop(0, "rgba(15, 139, 141, 0.18)");
  gradient.addColorStop(1, "rgba(15, 139, 141, 0)");

  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, plotW, plotH);
  ctx.clip();

  ctx.beginPath();
  rows.forEach((row, index) => {
    const x = xFor(index);
    const y = yFor(row.close);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xFor(rows.length - 1), height - pad.bottom);
  ctx.lineTo(xFor(0), height - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  rows.forEach((row, index) => {
    const x = xFor(index);
    const y = yFor(row.close);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#0f8b8d";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#647087";
  ctx.font = visibleDays < 7 ? "600 12px Inter, system-ui, sans-serif" : "12px Inter, system-ui, sans-serif";
  const xLabelTicks = visibleDays < 1 ? [] : visibleDays <= 14 ? dayTicks : weekTicks;
  xLabelTicks.forEach((timestamp) => {
    const label = fmtAxisTime(timestamp);
    const x = xForTime(timestamp);
    ctx.fillText(label, x, height - 14);
  });
  ctx.font = "12px Inter, system-ui, sans-serif";
  if (visibleDays >= 3 && visibleDays < 7) {
    middayTicks.forEach((timestamp) => {
      const x = xForTime(timestamp);
      ctx.fillText(fmtAxisHour(timestamp), x, height - 14);
    });
  }
  if (visibleDays < 1) {
    allHourTicks.forEach((timestamp) => {
      const hour = new Date(timestamp).getUTCHours();
      ctx.font = hour === 6 || hour === 12 || hour === 18 ? "600 12px Inter, system-ui, sans-serif" : "12px Inter, system-ui, sans-serif";
      const x = xForTime(timestamp);
      ctx.fillText(fmtAxisHour(timestamp), x, height - 14);
    });
  } else if (visibleDays < 3) {
    labeledHourTicks.forEach((timestamp) => {
      const x = xForTime(timestamp);
      ctx.fillText(fmtAxisHour(timestamp), x, height - 14);
    });
  }
  ctx.font = "12px Inter, system-ui, sans-serif";

  const placeTooltip = (element, x, y) => {
    const tooltipGap = 14;
    const tooltipMargin = 8;
    const tooltipWidth = element.offsetWidth;
    const tooltipHeight = element.offsetHeight;
    const tooltipLeft = Math.min(Math.max(x - tooltipWidth / 2, tooltipMargin), width - tooltipWidth - tooltipMargin);
    const hasRoomAbove = y - tooltipHeight - tooltipGap >= tooltipMargin;
    const tooltipTop = hasRoomAbove ? y - tooltipHeight - tooltipGap : y + tooltipGap;
    element.style.left = `${tooltipLeft}px`;
    element.style.top = `${Math.min(tooltipTop, height - tooltipHeight - tooltipMargin)}px`;
    element.style.transform = "none";
  };

  const drawTimeMarker = (rowIndex, color, label, element = null) => {
    const row = state.rows[rowIndex];
    if (!row) return false;
    const markerTime = new Date(row.time).getTime();
    if (markerTime < firstTime || markerTime > lastTime) return false;
    const x = xForTime(markerTime);
    const y = yFor(row.close);
    ctx.strokeStyle = color;
    ctx.lineWidth = label === "sim" ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (label) ctx.fillText(label, x + 6, pad.top + 14);
    if (element) {
      element.hidden = false;
      element.innerHTML = `${fmtTime(row.time)}<br><strong>${fmtPrice(row.close)}</strong>`;
      placeTooltip(element, x, y);
    }
    return true;
  };

  const hasSimMarker = state.sim.started && drawTimeMarker(state.sim.currentIndex, "#f25f5c", "sim", simTooltip);
  if (!hasSimMarker) simTooltip.hidden = true;

  if (state.sim.tableHoverIndex >= 0) {
    const hasTableMarker = drawTimeMarker(state.sim.tableHoverIndex, "rgba(15, 139, 141, 0.95)", "", tableTooltip);
    if (!hasTableMarker) tableTooltip.hidden = true;
  } else {
    tableTooltip.hidden = true;
  }

  if (state.hoverIndex >= 0 && rows[state.hoverIndex]) {
    const row = rows[state.hoverIndex];
    const x = xFor(state.hoverIndex);
    const y = yFor(row.close);
    ctx.strokeStyle = "#f25f5c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
    ctx.fillStyle = "#f25f5c";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    tooltip.hidden = false;
    tooltip.innerHTML = `${fmtTime(row.time)}<br><strong>${fmtPrice(row.close)}</strong>`;
    placeTooltip(tooltip, x, y);
  } else {
    tooltip.hidden = true;
  }
}

function updateRange(range) {
  state.range = range;
  state.hoverIndex = -1;
  state.zoomStart = 0;
  state.zoomEnd = 1;
  state.releaseRows = null;
  document.querySelectorAll(".filters button").forEach((button) => {
    button.classList.toggle("active", button.dataset.range === range);
  });
  updateMetrics(getVisibleRows());
  draw();
}

function rowTimestampMs(row) {
  return new Date(row.time).getTime();
}

function rowIndexForTimestamp(timestamp, mode = "nearest") {
  if (!state.rows.length) return 0;
  const lastIndex = state.rows.length - 1;
  if (timestamp <= rowTimestampMs(state.rows[0])) return 0;
  if (timestamp >= rowTimestampMs(state.rows[lastIndex])) return lastIndex;

  let low = 0;
  let high = lastIndex;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (rowTimestampMs(state.rows[mid]) < timestamp) low = mid + 1;
    else high = mid;
  }

  const afterIndex = low;
  const beforeIndex = Math.max(0, afterIndex - 1);
  if (mode === "atOrAfter") return afterIndex;
  if (mode === "atOrBefore") return rowTimestampMs(state.rows[afterIndex]) > timestamp ? beforeIndex : afterIndex;

  const beforeDelta = Math.abs(rowTimestampMs(state.rows[beforeIndex]) - timestamp);
  const afterDelta = Math.abs(rowTimestampMs(state.rows[afterIndex]) - timestamp);
  return afterDelta < beforeDelta ? afterIndex : beforeIndex;
}

function analyzeDataQuality(rows) {
  return analyzeRowsDataQuality(rows);
}

function dataQualityStatus(quality) {
  if (!quality || !quality.rowCount) return "CSV загружен";
  const source = quality.source ? `${quality.source.replace(/^\.\//, "")} · ` : "";
  const grid = quality.minuteRowCount && quality.minuteRowCount !== quality.rowCount
    ? ` · сетка ${quality.minuteRowCount.toLocaleString("en-US")} мин`
    : "";
  const issueCount = (quality.gapCount || 0)
    + (quality.duplicateTimestampCount || 0)
    + (quality.outOfOrderCount || 0)
    + (quality.invalidPriceCount || 0)
    + (quality.zeroPriceCount || 0)
    + (quality.emptyVolumeCount || 0);
  if (!issueCount) return `CSV загружен · ${source}${quality.rowCount.toLocaleString("en-US")} строк, без проблем${grid}`;
  const parts = [];
  if (quality.gapCount) parts.push(`пропущено ${quality.missingMinutes.toLocaleString("en-US")} мин`);
  if (quality.duplicateTimestampCount) parts.push(`дубликаты ${quality.duplicateTimestampCount.toLocaleString("en-US")}`);
  if (quality.invalidPriceCount || quality.zeroPriceCount) parts.push(`плохие цены ${(quality.invalidPriceCount + quality.zeroPriceCount).toLocaleString("en-US")}`);
  if (quality.emptyVolumeCount) parts.push(`пустой volume ${quality.emptyVolumeCount.toLocaleString("en-US")}`);
  return `CSV загружен · ${source}${quality.rowCount.toLocaleString("en-US")} строк, ${parts.join(", ")}${grid}`;
}

function dataQualityTitle(quality) {
  if (!quality || !quality.rowCount) return "";
  const details = [];
  if (quality.source) details.push(`Источник: ${quality.source}.`);
  if (quality.firstTime && quality.lastTime) details.push(`Период: ${fmtInputTime(quality.firstTime)} - ${fmtInputTime(quality.lastTime)} UTC.`);
  if (quality.minuteRowCount) details.push(`Поминутная сетка: ${quality.minuteRowCount.toLocaleString("en-US")} строк.`);
  if (quality.gapCount) {
    details.push(
      `Найдено ${quality.gapCount.toLocaleString("en-US")} разрывов в CSV.`,
      `Всего пропущено ${quality.missingMinutes.toLocaleString("en-US")} минут.`,
      `Максимальный разрыв: ${quality.maxGapMinutes} мин.`,
      "Симуляция идет по полной минутной сетке; пропущенные свечи помечаются quality flag и считаются по on-chain state.",
    );
  }
  if (quality.duplicateTimestampCount) details.push(`Дубликаты timestamp: ${quality.duplicateTimestampCount.toLocaleString("en-US")}.`);
  if (quality.outOfOrderCount) details.push(`Строки не по порядку: ${quality.outOfOrderCount.toLocaleString("en-US")}.`);
  if (quality.invalidPriceCount) details.push(`Некорректные price-поля: ${quality.invalidPriceCount.toLocaleString("en-US")}.`);
  if (quality.zeroPriceCount) details.push(`Нулевые или отрицательные price-поля: ${quality.zeroPriceCount.toLocaleString("en-US")}.`);
  if (quality.emptyVolumeCount) details.push(`Пустой или некорректный volume: ${quality.emptyVolumeCount.toLocaleString("en-US")}.`);
  return details.length ? details.join(" ") : "Поминутная сетка без обнаруженных проблем.";
}

function formatDuration(ms) {
  if (ms <= 0) return "0 с";
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) return restSeconds ? `${minutes} мин ${restSeconds} с` : `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours} ч ${restMinutes} мин` : `${hours} ч`;
}

function pluralRu(value, one, few, many) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function simulationEstimateText() {
  const samples = state.sim.stepDurations.slice(-60);
  if (samples.length < 3) return "ETA считается...";
  const averageMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const remainingSteps = Math.max(0, state.sim.endIndex - state.sim.currentIndex);
  const nextEtaMs = averageMs * remainingSteps;
  state.sim.etaMs = state.sim.etaMs > 0 ? state.sim.etaMs * 0.7 + nextEtaMs * 0.3 : nextEtaMs;
  return `ETA ${formatDuration(state.sim.etaMs)}`;
}

function simulationProgressText() {
  const done = Math.max(0, state.sim.currentIndex - state.sim.startIndex);
  const total = Math.max(0, state.sim.endIndex - state.sim.startIndex);
  const startTime = state.rows[state.sim.startIndex] ? rowTimestampMs(state.rows[state.sim.startIndex]) : 0;
  const currentTime = state.rows[state.sim.currentIndex] ? rowTimestampMs(state.rows[state.sim.currentIndex]) : startTime;
  const endTime = state.rows[state.sim.endIndex] ? rowTimestampMs(state.rows[state.sim.endIndex]) : currentTime;
  const doneMinutes = Math.max(0, Math.round((currentTime - startTime) / (60 * 1000)));
  const totalMinutes = Math.max(0, Math.round((endTime - startTime) / (60 * 1000)));
  return `${done} / ${total} свечей (${doneMinutes} / ${totalMinutes} мин) · ${simulationEstimateText()}`;
}

function formatCompactDurationSeconds(seconds, { approximate = false } = {}) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const prefix = approximate ? "~" : "";
  if (total < 60) return `${prefix}${total}s`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${prefix}${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${prefix}${hours}h ${restMinutes}m` : `${prefix}${hours}h`;
}

function formatProgressTimestamp(value) {
  const timestamp = typeof value === "number" ? value * 1000 : Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp)).replace(",", "");
}

function estimateServerTotalRows(simulation) {
  const params = simulation?.params || {};
  const start = parseInputTime(params.start || "");
  const end = parseInputTime(params.end || "");
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.max(0, Math.round((end - start) / (60 * 1000)) + 1);
}

function serverProcessingTimestamp(simulation) {
  const progress = simulation?.progress || {};
  const result = simulation?.result || {};
  const latest = result.latestRawRow || progress.latestRawRow || serverSimulation.rawRows.at(-1) || null;
  return formatProgressTimestamp(latest?.time || latest?.timestamp || "");
}

function serverEtaText(simulation, elapsedSeconds, rowsDone, totalRows) {
  if (!serverSimulation.running || rowsDone <= 0 || totalRows <= rowsDone || elapsedSeconds <= 0) return "—";
  const remainingSeconds = (elapsedSeconds / rowsDone) * (totalRows - rowsDone);
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return "—";
  return formatCompactDurationSeconds(remainingSeconds, { approximate: true });
}

function setServerSimulationProgressNotice({ status, elapsed, processing, rows, eta }) {
  simNotice.replaceChildren();
  simNotice.classList.add("simProgressNotice");
  const columns = [
    ["Status", status || "unknown"],
    ["Elapsed", elapsed || "—"],
    ["Processing", processing || "—"],
    ["Rows", rows || "—"],
    ["ETA", eta || "—"],
  ];
  for (const [label, value] of columns) {
    const item = document.createElement("div");
    item.className = "simProgressCell";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    const valueEl = document.createElement("strong");
    valueEl.textContent = value;
    item.append(labelEl, valueEl);
    simNotice.append(item);
  }
}

function recordSimulationStepDuration(startedAt) {
  state.sim.stepDurations.push(performance.now() - startedAt);
  if (state.sim.stepDurations.length > 120) state.sim.stepDurations.shift();
}

function setSimulationStart(index) {
  const bounded = Math.min(Math.max(index, 0), Math.max(0, state.rows.length - 1));
  state.sim.startIndex = bounded;
  if (!state.sim.started) state.sim.currentIndex = bounded;
  if (state.rows[bounded]) simStartInput.value = fmtInputTime(state.rows[bounded].time);
  draw();
}

function setSimulationEnd(index) {
  const bounded = Math.min(Math.max(index, 0), Math.max(0, state.rows.length - 1));
  state.sim.endIndex = bounded;
  if (state.rows[bounded]) simEndInput.value = fmtInputTime(state.rows[bounded].time);
  draw();
}

function setActiveTimeInput(inputName) {
  state.activeTimeInput = inputName;
  simStartInput.classList.toggle("activeTimeInput", inputName === "start");
  simEndInput.classList.toggle("activeTimeInput", inputName === "end");
}

function setActiveSimulationTime(index) {
  resetSimulationRows();
  if (state.activeTimeInput === "end") {
    setSimulationEnd(index);
    setSimulationNotice("Конец симуляции выбран по графику.");
  } else {
    setSimulationStart(index);
    setSimulationNotice("Старт симуляции выбран по графику.");
  }
}

function nudgeTimeInput(inputName, deltaMinutes) {
  const input = inputName === "end" ? simEndInput : simStartInput;
  const timestamp = parseInputTime(input.value);
  if (Number.isNaN(timestamp)) {
    setSimulationNotice(`Не могу разобрать ${inputName === "end" ? "дату конца" : "дату старта"}. Используй формат 2026-02-01 00:00.`);
    return;
  }
  const index = rowIndexForTimestamp(timestamp + deltaMinutes * 60 * 1000, inputName === "end" ? "atOrBefore" : "atOrAfter");
  resetSimulationRows();
  if (inputName === "end") setSimulationEnd(index);
  else setSimulationStart(index);
}

function zoomToSimulationRange(startIndex, endIndex) {
  const rangeRows = getRangeRows();
  if (rangeRows.length <= 1) return;
  const startPosition = rangeRows.findIndex((row) => row.index === startIndex);
  const endPosition = rangeRows.findIndex((row) => row.index === endIndex);
  if (startPosition < 0 || endPosition < 0) {
    updateRange("all");
    zoomToSimulationRange(startIndex, endIndex);
    return;
  }
  const rangeSpan = rangeRows.length - 1;
  const minWindowRows = Math.min(60, rangeRows.length - 1);
  const paddedStart = Math.max(0, Math.min(startPosition, endPosition));
  const paddedEnd = Math.min(rangeRows.length - 1, Math.max(startPosition, endPosition));
  let nextStart = paddedStart / rangeSpan;
  let nextEnd = paddedEnd / rangeSpan;
  const minWindowSize = rangeSpan > 0 ? Math.min(1, minWindowRows / rangeSpan) : 1;
  if (nextEnd - nextStart < minWindowSize) {
    const center = (nextStart + nextEnd) / 2;
    nextStart = center - minWindowSize / 2;
    nextEnd = center + minWindowSize / 2;
    if (nextStart < 0) {
      nextEnd -= nextStart;
      nextStart = 0;
    }
    if (nextEnd > 1) {
      nextStart -= nextEnd - 1;
      nextEnd = 1;
    }
  }
  state.zoomStart = Math.max(0, nextStart);
  state.zoomEnd = Math.min(1, nextEnd);
  state.hoverIndex = -1;
  state.releaseRows = null;
  updateMetrics(getVisibleRows());
}

function updateSimulationControls() {
  if (SERVER_SIMULATION_MODE) {
    if (serverSimulation.running && !serverSimulation.paused) {
      runSimulation.textContent = "PAUSE";
      runSimulation.title = "Пауза серверной симуляции";
      runSimulation.disabled = false;
    } else {
      runSimulation.textContent = serverSimulation.paused ? "RESUME" : "START";
      runSimulation.title = serverSimulation.paused ? "Продолжить серверную симуляцию" : "Запустить серверную симуляцию";
      runSimulation.disabled = false;
    }
    if (resetSimulationButton) {
      const hasActiveServerSimulation = Boolean(serverSimulation.id && (serverSimulation.running || serverSimulation.paused));
      resetSimulationButton.textContent = hasActiveServerSimulation ? "STOP" : "RESET";
      resetSimulationButton.title = hasActiveServerSimulation ? "Остановить серверную симуляцию" : "Reset simulation";
      resetSimulationButton.disabled = false;
    }
    stepBack.disabled = true;
    stepForward.disabled = true;
    return;
  }
  if (state.sim.initializing || state.sim.autoRunning) {
    runSimulation.textContent = "PAUSE";
    runSimulation.title = "Пауза симуляции";
  } else if (!state.sim.started) {
    runSimulation.textContent = "START";
    runSimulation.title = "Старт симуляции";
  } else {
    runSimulation.textContent = "RESUME";
    runSimulation.title = "Продолжить симуляцию";
  }
  if (resetSimulationButton) {
    resetSimulationButton.textContent = state.sim.started || state.sim.initializing || state.sim.autoRunning ? "STOP" : "RESET";
    resetSimulationButton.title = state.sim.started || state.sim.initializing || state.sim.autoRunning ? "Остановить симуляцию" : "Reset simulation";
    resetSimulationButton.disabled = state.sim.rows.length === 0 && !state.sim.started && !state.sim.initializing;
  }
  stepBack.disabled = state.sim.initializing || state.sim.autoRunning || state.sim.rows.length <= 1;
  stepForward.disabled = state.sim.initializing || state.sim.autoRunning || state.sim.stepInProgress || state.sim.stopped || !state.sim.started || state.sim.currentIndex >= state.sim.endIndex;
}

function resetSimulationRows() {
  state.sim.initializing = false;
  state.sim.autoRunning = false;
  state.sim.stepInProgress = false;
  state.sim.runToken += 1;
  state.sim.autoLoopId += 1;
  state.sim.stepDurations = [];
  state.sim.etaMs = 0;
  state.sim.rows = [];
  state.sim.started = false;
  state.sim.stopped = false;
  state.sim.rewardStart = 0n;
  state.sim.startGridTick = 0;
  state.sim.rangeStepTicks = 0;
  state.sim.rewardLast = 0n;
  state.sim.feeGrowthInside0Last = 0n;
  state.sim.feeGrowthInside1Last = 0n;
  state.sim.feeDilutionLiquidityLast = 0n;
  state.sim.rewardDilutionLiquidityLast = 0n;
  state.sim.aeroUnharvested = 0;
  state.sim.aeroBaseUnharvested = 0;
  state.sim.aeroHaircutUnharvested = 0;
  state.sim.aeroHarvestedUsdc = 0;
  state.sim.aeroBaseHarvestedUsdc = 0;
  state.sim.aeroHaircutUsdc = 0;
  state.sim.lpFeesWeth = 0;
  state.sim.lpFeesUsdc = 0;
  state.sim.lpFeesUsdcValue = 0;
  state.sim.aeroPriceReliability = 100;
  state.sim.aeroPriceAgeSeconds = 0;
  state.sim.tableHoverIndex = -1;
  state.sim.activeRowIndex = -1;
  simTableBody.innerHTML = "";
  simTableWrap.hidden = true;
  currentPositionValue.textContent = "$0.00";
  currentAeroEarned.textContent = "$0.00";
  updateSimulationControls();
  draw();
}

function simulationRowTitle(row) {
  const details = [
    row.reliabilityDetails ? `reliability: ${row.reliabilityDetails}` : "",
    row.impactDetails || "",
  ].filter(Boolean).join("; ");
  if (!row.rebalance) return details;
  const rb = row.rebalance;
  return `${details}; swap ${rb.swapDirection} via ${rb.swapSource}; swap loss ${fmtUsdc(rb.swapLossUsdc)}; gas ${fmtUsdc(rb.gasUsdc)}; fee ${fmtUsdc(rb.automationFeeUsdc)}; ticks ${rb.oldTickLower}..${rb.oldTickUpper} -> ${rb.newTickLower}..${rb.newTickUpper}`;
}

function compactNumber(value, digits = 8) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits));
}

function simulationRowToRaw(row) {
  if (!row) return null;
  const marketRow = state.rows[row.index] || {};
  const stateAfter = row.stateAfter || {};
  const tickLower = Number.isFinite(stateAfter.tickLower) ? stateAfter.tickLower : state.sim.tickLower;
  const tickUpper = Number.isFinite(stateAfter.tickUpper) ? stateAfter.tickUpper : state.sim.tickUpper;
  const raw = {
    index: row.index,
    time: marketRow.time || "",
    timestamp: marketRow.time ? Math.floor(rowTimestampMs(marketRow) / 1000) : null,
    event: row.event || "",
    blockNumber: row.blockNumber || null,
    tick: Number.isFinite(row.tick) ? row.tick : null,
    tickLower,
    tickUpper,
    rangeLowerPrice: compactNumber(priceForTick(tickLower), 6),
    rangeUpperPrice: compactNumber(priceForTick(tickUpper), 6),
    missingCandle: Boolean(marketRow.missingCandle),
    qualityFlags: [...(marketRow.qualityFlags || [])],
    price: compactNumber(row.price, 6),
    value: compactNumber(row.value, 6),
    valueWithLpFees: compactNumber(row.valueWithLpFees ?? row.value, 6),
    weth: compactNumber(row.weth, 10),
    usdc: compactNumber(row.usdc, 6),
    lpFeesWeth: compactNumber(row.lpFeesWeth, 10),
    lpFeesUsdc: compactNumber(row.lpFeesUsdc, 6),
    lpFeesUsdcValue: compactNumber(row.lpFeesUsdcValue, 6),
    lpFeesTotalUsdc: compactNumber(row.lpFeesTotalUsdc, 6),
    lpFeesSource: row.lpFeesSource || "",
    lpFeesSourceLabel: normalizeSourceLabel(row.lpFeesSourceLabel || "counterfactual-adjusted"),
    lpFeesReliability: compactNumber(row.lpFeesReliability, 4),
    lpFeesSwapCount: row.lpFeesSwapCount || 0,
    lpFeesRangeCrossed: Boolean(row.lpFeesRangeCrossed),
    aeroUsdc: compactNumber(row.aeroUsdc, 6),
    aeroTotalUsdc: compactNumber(row.aeroTotalUsdc, 6),
    aeroBaseUsdc: compactNumber(row.aeroBaseUsdc, 6),
    aeroHaircutUsdc: compactNumber(row.aeroHaircutUsdc, 6),
    aeroBase: compactNumber(row.aeroBase, 6),
    aeroConservative: compactNumber(row.aeroConservative, 6),
    aeroImpactHaircut: compactNumber(row.aeroImpactHaircut, 6),
    aeroImpactModel: row.aeroImpactModel || "counterfactual-conservative-haircut",
    aeroImpactAssumption: row.aeroImpactAssumption || "",
    aeroAmount: compactNumber(row.aeroAmount, 10),
    aeroTotalAmount: compactNumber(row.aeroTotalAmount, 10),
    aeroBaseAmount: compactNumber(row.aeroBaseAmount, 10),
    aeroHaircutAmount: compactNumber(row.aeroHaircutAmount, 10),
    aeroPrice: compactNumber(row.aeroPrice, 8),
    aeroModel: row.aeroModel || "conservative-scenario",
    aeroSource: row.aeroSource || "gauge-rewardInside-reconstructed",
    aeroSourceLabel: normalizeSourceLabel(row.aeroSourceLabel || "counterfactual-adjusted"),
    aeroReliability: compactNumber(row.aeroReliability ?? row.reliability, 4),
    priceSourceLabel: "exact-onchain",
    csvPriceSourceLabel: marketRow.missingCandle ? "estimated" : "heuristic",
    csvOnchainDivergenceBps: Number.isFinite(marketRow.open) && Number.isFinite(row.price) && row.price > 0
      ? compactNumber(Math.abs(marketRow.open / row.price - 1) * 10000, 4)
      : null,
    sourceLabels: Array.from(new Set([
      "exact-onchain",
      normalizeSourceLabel(row.lpFeesSourceLabel || "counterfactual-adjusted"),
      normalizeSourceLabel(row.aeroSourceLabel || "counterfactual-adjusted"),
      marketRow.missingCandle ? "estimated" : "heuristic",
      row.rebalance?.swapIsFallback ? "fallback" : null,
    ].filter(Boolean))),
    reliability: compactNumber(row.reliability, 4),
  };
  if (row.rebalance) {
    raw.rebalance = {
      oldTickLower: row.rebalance.oldTickLower,
      oldTickUpper: row.rebalance.oldTickUpper,
      newTickLower: row.rebalance.newTickLower,
      newTickUpper: row.rebalance.newTickUpper,
      swapDirection: row.rebalance.swapDirection,
      swapSource: row.rebalance.swapSource,
      swapSourceLabel: normalizeSourceLabel(row.rebalance.swapSourceLabel || (row.rebalance.swapIsFallback ? "fallback" : "reconstructed-onchain")),
      swapIsFallback: Boolean(row.rebalance.swapIsFallback),
      fallbackSlippageBps: compactNumber(row.rebalance.fallbackSlippageBps, 4),
      quoteFailureReason: row.rebalance.quoteFailureReason || "",
      quoteAttempts: row.rebalance.quoteAttempts || 0,
      swapLossUsdc: compactNumber(row.rebalance.swapLossUsdc, 6),
      gasUsdc: compactNumber(row.rebalance.gasUsdc, 6),
      gasSource: row.rebalance.gasSource || "historical-baseFeePerGas-plus-configured-l1-data-fee",
      l2GasFeeUsdc: compactNumber(row.rebalance.l2GasFeeUsdc, 6),
      l1DataFeeUsdc: compactNumber(row.rebalance.l1DataFeeUsdc, 6),
      gasReliability: compactNumber(row.rebalance.gasReliability, 4),
      gasAssumptions: [...(row.rebalance.gasAssumptions || [])],
      gasUnits: row.rebalance.gasUnits || null,
      l1DataFeeEth: compactNumber(row.rebalance.l1DataFeeEth, 10),
      automationFeeUsdc: compactNumber(row.rebalance.automationFeeUsdc, 6),
      automationFeeBps: compactNumber(row.rebalance.automationFeeBps, 4),
      totalCostUsdc: compactNumber(row.rebalance.totalCostUsdc, 6),
      quoteOutputAmount: compactNumber(row.rebalance.quoteOutputAmount, 10),
      quoteReliability: compactNumber(row.rebalance.quoteReliability, 4),
    };
  }
  return raw;
}

function getSimulationRawRows() {
  return state.sim.rows.map(simulationRowToRaw).filter(Boolean);
}

function getSimulationDataQuality() {
  return state.dataQuality || null;
}

function simulationRawRowToCells(row) {
  if (!row || typeof row !== "object") return [];
  const eventParts = [row.missingCandle ? `${row.event} · missing candle` : row.event];
  if (row.rebalance?.swapIsFallback) eventParts.push("swap fallback");
  return [
    row.time ? fmtInputTime(row.time) : "",
    eventParts.filter(Boolean).join(" · "),
    fmtUsdc(row.value),
    fmtPrice(row.price),
    fmtNumber(row.weth, 8),
    fmtNumber(row.usdc, 2),
    fmtUsdc(row.aeroUsdc),
    fmtUsdc(row.lpFeesUsdcValue || 0),
    fmtReliability(row.reliability),
  ];
}

function renderSimulationTable(scrollToLatest = false) {
  simTableBody.innerHTML = state.sim.rows.map((row) => `
    <tr data-index="${row.index}" class="${row.index === state.sim.activeRowIndex ? "activeRow" : ""}" title="${simulationRowTitle(row)}">
      <td>${fmtInputTime(state.rows[row.index]?.time || "")}</td>
      <td>${[row.event, row.rebalance?.swapIsFallback ? "swap fallback" : ""].filter(Boolean).join(" · ")}</td>
      <td>${fmtUsdc(row.value)}</td>
      <td>${fmtPrice(row.price)}</td>
      <td>${fmtNumber(row.weth, 8)}</td>
      <td>${fmtNumber(row.usdc, 2)}</td>
      <td>${fmtUsdc(row.aeroUsdc)}</td>
      <td>${fmtUsdc(row.lpFeesUsdcValue || 0)}</td>
      <td>${fmtReliability(row.reliability)}</td>
    </tr>
  `).join("");
  simTableBody.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("mouseenter", () => {
      state.sim.tableHoverIndex = Number(row.dataset.index);
      draw();
    });
    row.addEventListener("mouseleave", () => {
      state.sim.tableHoverIndex = -1;
      draw();
    });
  });
  simTableWrap.hidden = state.sim.rows.length === 0;
  const last = state.sim.rows[state.sim.rows.length - 1];
  if (last) {
    currentPositionValue.textContent = fmtUsdc(last.value);
    currentAeroEarned.textContent = fmtUsdc(last.aeroTotalUsdc ?? last.aeroUsdc);
  }
  updateSimulationControls();
  if (scrollToLatest && last) {
    const lastRow = simTableBody.querySelector(`tr[data-index="${last.index}"]`);
    if (lastRow) {
      const wrapRect = simTableWrap.getBoundingClientRect();
      const rowRect = lastRow.getBoundingClientRect();
      if (rowRect.bottom > wrapRect.bottom) {
        simTableWrap.scrollTop += rowRect.bottom - wrapRect.bottom + 8;
      } else if (rowRect.top < wrapRect.top) {
        simTableWrap.scrollTop -= wrapRect.top - rowRect.top + 8;
      }
    }
  }
  draw();
}

function setSimulationNotice(message) {
  if (simNotice.classList?.remove) simNotice.classList.remove("simProgressNotice");
  const notice = typeof message === "string" ? { status: message, details: "" } : message;
  let statusEl = simNotice.querySelector(".simNoticeStatus");
  let detailsEl = simNotice.querySelector(".simNoticeDetails");
  let estimateEl = simNotice.querySelector(".simNoticeEstimate");
  if (!statusEl || !detailsEl || !estimateEl) {
    simNotice.replaceChildren();
    statusEl = document.createElement("div");
    detailsEl = document.createElement("div");
    estimateEl = document.createElement("div");
    const rightEl = document.createElement("div");
    statusEl.className = "simNoticeStatus";
    rightEl.className = "simNoticeRight";
    detailsEl.className = "simNoticeDetails";
    estimateEl.className = "simNoticeEstimate";
    rightEl.append(detailsEl, estimateEl);
    simNotice.append(statusEl, rightEl);
  }
  const nextStatus = notice.status || "";
  const nextDetails = notice.details || "";
  const nextEstimate = notice.estimate || "";
  if (statusEl.textContent !== nextStatus) statusEl.textContent = nextStatus;
  if (detailsEl.textContent !== nextDetails) detailsEl.textContent = nextDetails;
  if (estimateEl.textContent !== nextEstimate) estimateEl.textContent = nextEstimate;
}

const simulationEngine = WalletWatchSimulationEngine.create({
  state,
  performance,
  findBlockAtOrAfter,
  findSwapExit,
  estimateLpFees,
  getBlock,
  readRewardInside,
  getAeroPrice,
  ensureActiveSimulation,
  priceForTick,
  priceFromSqrtX96,
  computePositionPlanForRange,
  tickRangeAroundTick,
  estimateHistoricalSwap,
  rewardStateReliability,
  blockTimeReliability,
  priceAgreementReliability,
  conservativeReliability,
  scoreFromThresholds,
  fmtNumber,
  fmtUsdc,
  reliabilityDetailsText,
  AERODROME_TICK_SPACING,
  REBALANCE_MANUAL_FEE_BPS,
  REBALANCE_GAS_UNITS,
  REBALANCE_L1_DATA_FEE_ETH,
  REBALANCE_FALLBACK_SLIPPAGE_BPS,
  AERO_IMPACT_HAIRCUT_MAX,
  Q128,
  AERO_DECIMALS,
  recordSimulationStepDuration,
  simulationProgressText,
  setSimulationNotice,
  renderSimulationTable,
  updateSimulationControls,
});

async function fetchJson(url, options = {}) {
  const adminToken = typeof localStorage !== "undefined" ? localStorage.getItem("walletWatchAdminToken") : "";
  const adminHeaders = adminToken ? { "X-Admin-API-Token": adminToken } : {};
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...adminHeaders, ...(options.headers || {}) },
    ...options,
  });
  if (response.status === 401 && typeof prompt === "function" && typeof localStorage !== "undefined") {
    const token = prompt("Введите ADMIN_API_TOKEN для серверной операции");
    if (token) {
      localStorage.setItem("walletWatchAdminToken", token);
      return await fetchJson(url, options);
    }
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.error || payload?.message || `HTTP ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.code = payload?.code || "";
    error.retryAfterSeconds = payload?.retryAfterSeconds || 0;
    throw error;
  }
  return payload;
}

function isServerSimulationTerminal(status) {
  return ["completed", "failed", "stopped", "timeout", "error", "cancelled"].includes(status);
}

function serverSimulationText(simulation) {
  const progress = simulation?.progress || {};
  const result = simulation?.result || {};
  const payload = Object.keys(result).length ? result : progress;
  const rows = payload.rows || 0;
  const elapsed = payload.elapsedSeconds ? formatDuration(payload.elapsedSeconds * 1000) : "";
  const notice = (payload.notice || simulation?.error || "").replace(/до даты конца/g, "до конца");
  return {
    rows,
    elapsed,
    currentValue: payload.currentValue || "",
    currentAero: payload.currentAero || "",
    notice,
  };
}

function formatStopwatch(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const restSeconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(restSeconds).padStart(2, "0");
  return hours ? `${String(hours).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;
}

function serverElapsedSeconds(simulation) {
  const progressElapsed = Number(simulation?.progress?.elapsedSeconds || simulation?.result?.elapsedSeconds || 0);
  if (Number.isFinite(progressElapsed) && progressElapsed > 0) return Math.floor(progressElapsed);
  if (!serverSimulation.startedAtMs && simulation?.created_at) {
    serverSimulation.startedAtMs = simulation.created_at * 1000;
  }
  return serverSimulation.startedAtMs ? Math.floor((Date.now() - serverSimulation.startedAtMs) / 1000) : 0;
}

function applyServerRawProgress(simulation) {
  if (!SERVER_SIMULATION_MODE) return;
  const progress = simulation?.progress || {};
  const resultRows = simulation?.result?.rawRows;
  const progressRows = progress.rawRows;
  if (Array.isArray(resultRows)) {
    serverSimulation.rawRows = resultRows;
  } else if (Array.isArray(progressRows)) {
    serverSimulation.rawRows = progressRows;
  } else if (Array.isArray(progress.newRawRows) && progress.newRawRows.length) {
    const byKey = new Map(serverSimulation.rawRows.map((row) => [`${row.index}:${row.blockNumber}:${row.event}`, row]));
    progress.newRawRows.forEach((row) => byKey.set(`${row.index}:${row.blockNumber}:${row.event}`, row));
    serverSimulation.rawRows = Array.from(byKey.values()).sort((a, b) => (a.index || 0) - (b.index || 0));
  }
  const latest = (Array.isArray(resultRows) && resultRows.at(-1)) || progress.latestRawRow || serverSimulation.rawRows.at(-1);
  if (!latest) return;
  state.sim.started = true;
  state.sim.currentIndex = latest.index;
  state.sim.activeRowIndex = latest.index;
  state.sim.tickLower = latest.tickLower;
  state.sim.tickUpper = latest.tickUpper;
  state.sim.startGridTick = state.sim.startGridTick || latest.tickLower;
  state.sim.rangeStepTicks = Math.max(
    AERODROME_TICK_SPACING,
    Math.round(Math.abs((latest.tickUpper || 0) - (latest.tickLower || 0)) / AERODROME_TICK_SPACING) * AERODROME_TICK_SPACING,
  );
  draw();
}

function serverJobLabel(simulation) {
  const params = simulation?.params || {};
  const range = params.rangePct ? `${params.rangePct}%` : "";
  return [params.start, params.end, range].filter(Boolean).join(" -> ");
}

function serverJobMeta(simulation) {
  const info = serverSimulationText(simulation);
  const created = simulation?.created_at ? new Date(simulation.created_at * 1000).toLocaleString() : "";
  return [
    simulation?.status || "unknown",
    info.rows ? `${info.rows} rows` : "",
    info.currentValue || "",
    info.currentAero ? `AERO ${info.currentAero}` : "",
    created,
  ].filter(Boolean).join(" · ");
}

function resultTabId(id) {
  return `result:${id}`;
}

function resultIdFromTab(tabId) {
  return tabId && tabId.startsWith("result:") ? tabId.slice("result:".length) : "";
}

function serverJobTabLabel(simulation) {
  const params = simulation?.params || {};
  const end = params.end ? String(params.end).slice(5) : "";
  const start = params.start ? String(params.start).slice(5) : "";
  const range = params.rangePct ? `${params.rangePct}%` : "";
  return [end || start || "Simulation", range].filter(Boolean).join(" - ");
}

function renderProjectTabs() {
  if (appTabNew) appTabNew.classList.toggle("active", appTabs.active === "new");
  if (appTabHistory) appTabHistory.classList.toggle("active", appTabs.active === "history");
  if (!resultTabs) return;
  resultTabs.replaceChildren();
  for (const [id, simulation] of appTabs.results) {
    const tab = document.createElement("div");
    tab.className = `projectResultTab${appTabs.active === resultTabId(id) ? " active" : ""}`;
    tab.dataset.resultId = id;
    tab.title = serverJobLabel(simulation) || id;

    const label = document.createElement("button");
    label.type = "button";
    label.className = "projectTabLabel";
    label.dataset.tabAction = "activate";
    label.textContent = serverJobTabLabel(simulation);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "projectTabClose";
    close.dataset.tabAction = "close";
    close.setAttribute("aria-label", "Close simulation result");
    close.textContent = "\u00d7";

    tab.append(label, close);
    resultTabs.append(tab);
  }
}

function setAppTab(tabId) {
  appTabs.active = tabId;
  const resultId = resultIdFromTab(tabId);
  if (chartView) chartView.hidden = tabId !== "new";
  if (newSimulationView) newSimulationView.hidden = tabId !== "new";
  if (historyView) historyView.hidden = tabId !== "history";
  if (simulationResultView) simulationResultView.hidden = !resultId;
  renderProjectTabs();
  if (resultId) renderSimulationResultView(appTabs.results.get(resultId));
  if (tabId === "history") loadServerJobs();
  if (tabId === "new") requestAnimationFrame(draw);
  window.scrollTo(0, 0);
}

function createResultMetric(label, value) {
  const metric = document.createElement("div");
  metric.className = "resultMetric";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const valueEl = document.createElement("strong");
  valueEl.textContent = value || "-";
  metric.append(labelEl, valueEl);
  return metric;
}

function simulationWarnings(rawRows = [], dataQuality = null) {
  const warnings = new Set();
  if (dataQuality?.missingMinutes > 0) warnings.add(`${dataQuality.missingMinutes} missing CSV minute(s) filled`);
  if (rawRows.some((row) => row?.missingCandle)) warnings.add("missing candles present in raw rows");
  if (rawRows.some((row) => row?.rebalance?.swapIsFallback)) warnings.add("rebalance swap fallback used");
  if (rawRows.some((row) => (row?.csvOnchainDivergenceBps || 0) > 100)) warnings.add("CSV/on-chain price divergence above 100 bps");
  if (rawRows.some((row) => row?.sourceLabels?.includes("estimated"))) warnings.add("estimated fields present");
  if (rawRows.some((row) => row?.sourceLabels?.includes("heuristic"))) warnings.add("heuristic quality fields present");
  return Array.from(warnings);
}

function renderResultTableRows(tableRows = []) {
  if (!resultTableBody || !resultTableWrap || !resultEmpty) return;
  resultTableBody.replaceChildren();
  if (!tableRows.length) {
    resultTableWrap.hidden = true;
    resultEmpty.hidden = false;
    resultEmpty.textContent = "Detailed rows are not stored for this simulation.";
    return;
  }
  for (const rowItem of tableRows) {
    const tr = document.createElement("tr");
    const cells = typeof rowItem === "object" && rowItem !== null
      ? simulationRawRowToCells(rowItem)
      : String(rowItem).split("\t").map((cellText) => cellText.trim());
    cells.forEach((cellText) => {
      const td = document.createElement("td");
      td.textContent = cellText;
      tr.append(td);
    });
    resultTableBody.append(tr);
  }
  resultEmpty.hidden = true;
  resultTableWrap.hidden = false;
}

function renderSimulationResultView(simulation) {
  if (!simulation) {
    if (resultTitle) resultTitle.textContent = "Simulation result";
    if (resultSubtitle) resultSubtitle.textContent = "Simulation is no longer available.";
    if (resultSummary) resultSummary.replaceChildren();
    if (resultLastRow) resultLastRow.textContent = "";
    renderResultTableRows([]);
    return;
  }
  const info = serverSimulationText(simulation);
  const created = simulation.created_at ? new Date(simulation.created_at * 1000).toLocaleString() : "";
  const finished = simulation.finished_at ? new Date(simulation.finished_at * 1000).toLocaleString() : "";
  if (resultTitle) resultTitle.textContent = serverJobLabel(simulation) || simulation.id;
  if (resultSubtitle) {
    resultSubtitle.textContent = [
      `status: ${simulation.status || "unknown"}`,
      created ? `created: ${created}` : "",
      finished ? `finished: ${finished}` : "",
      `id: ${simulation.id}`,
    ].filter(Boolean).join(" · ");
  }
  if (resultSummary) {
    const rawRows = simulation?.result?.rawRows || simulation?.progress?.rawRows || [];
    const warnings = simulationWarnings(rawRows, simulation?.result?.dataQuality || simulation?.progress?.dataQuality || null);
    resultSummary.replaceChildren(
      createResultMetric("Status", simulation.status || "unknown"),
      createResultMetric("Rows", info.rows ? String(info.rows) : ""),
      createResultMetric("Position value", info.currentValue),
      createResultMetric("AERO earned", info.currentAero),
      createResultMetric("Elapsed", info.elapsed),
      createResultMetric("Warnings", warnings.length ? warnings.join("; ") : "none"),
    );
  }
  if (resultLastRow) {
    resultLastRow.textContent = info.notice;
  }
  const liveRows = simulation?.id === serverSimulation.id ? serverSimulation.rawRows : [];
  renderResultTableRows(simulation?.result?.rawRows || simulation?.result?.tableRows || liveRows || []);
}

function openSimulationResultTab(simulation) {
  if (!simulation?.id) return;
  appTabs.results.set(simulation.id, simulation);
  setAppTab(resultTabId(simulation.id));
}

function syncOpenedSimulation(simulation) {
  if (!simulation?.id || !appTabs.results.has(simulation.id)) return;
  appTabs.results.set(simulation.id, simulation);
  renderProjectTabs();
  if (appTabs.active === resultTabId(simulation.id)) renderSimulationResultView(simulation);
}

function closeSimulationResultTab(id) {
  if (!id) return;
  const wasActive = appTabs.active === resultTabId(id);
  appTabs.results.delete(id);
  if (wasActive) {
    const ids = Array.from(appTabs.results.keys());
    const fallbackId = ids[ids.length - 1];
    setAppTab(fallbackId ? resultTabId(fallbackId) : "history");
  } else {
    renderProjectTabs();
  }
}

function renderServerJobsList(items = serverSimulation.jobs) {
  if (!SERVER_SIMULATION_MODE || !serverJobs || !serverJobsList) return;
  serverJobs.hidden = false;
  serverJobsList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "serverJob";
    empty.textContent = "No server jobs yet.";
    serverJobsList.append(empty);
    return;
  }
  for (const simulation of items) {
    const row = document.createElement("div");
    row.className = "serverJob";
    row.dataset.id = simulation.id;
    row.title = "Open simulation result";

    const main = document.createElement("div");
    main.className = "serverJobMain";
    const title = document.createElement("div");
    title.className = "serverJobTitle";
    title.textContent = serverJobLabel(simulation) || simulation.id;
    const meta = document.createElement("div");
    meta.className = "serverJobMeta";
    meta.textContent = serverJobMeta(simulation);
    main.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "serverJobActions";
    if (!isServerSimulationTerminal(simulation.status)) {
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.dataset.action = "cancel";
      cancelButton.className = "danger";
      cancelButton.textContent = "CANCEL";
      actions.append(cancelButton);
    }
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.className = "danger";
    deleteButton.textContent = "DELETE";
    actions.append(deleteButton);

    row.append(main, actions);
    serverJobsList.append(row);
  }
}

function setServerJobsRefreshLoading(isLoading) {
  if (!refreshServerJobs) return;
  refreshServerJobs.disabled = isLoading;
  refreshServerJobs.classList.toggle("loading", isLoading);
  if (refreshDoneCheck) refreshDoneCheck.classList.toggle("loading", isLoading);
  refreshServerJobs.setAttribute("aria-busy", isLoading ? "true" : "false");
  refreshServerJobs.textContent = isLoading ? "Loading" : "Refresh";
}

function showServerJobsRefreshDone() {
  if (!refreshDoneCheck) return;
  refreshDoneCheck.classList.remove("show");
  void refreshDoneCheck.offsetWidth;
  refreshDoneCheck.classList.add("show");
}

function animateServerJobDelete(row) {
  if (!row) return Promise.resolve();
  row.style.maxHeight = `${row.offsetHeight}px`;
  row.getBoundingClientRect();
  row.classList.add("deleting");
  return new Promise((resolve) => setTimeout(resolve, 1000));
}

function renderServerResultTable(simulation) {
  const tableRows = simulation?.result?.rawRows || simulation?.result?.tableRows || serverSimulation.rawRows || [];
  if (!SERVER_SIMULATION_MODE || !simTableBody || !simTableWrap || !tableRows.length) return;
  simTableBody.replaceChildren();
  tableRows.forEach((rowItem, index) => {
    const tr = document.createElement("tr");
    tr.dataset.index = String(index);
    const cells = typeof rowItem === "object" && rowItem !== null
      ? simulationRawRowToCells(rowItem)
      : String(rowItem).split("\t").map((cellText) => cellText.trim());
    cells.forEach((cellText) => {
      const td = document.createElement("td");
      td.textContent = cellText;
      tr.append(td);
    });
    simTableBody.append(tr);
  });
  simTableWrap.hidden = false;
}

async function loadServerJobs(options = {}) {
  if (!SERVER_SIMULATION_MODE || !serverJobsList) return;
  const showFeedback = Boolean(options.feedback);
  const feedbackStartedAt = showFeedback ? performance.now() : 0;
  let loaded = false;
  if (showFeedback) setServerJobsRefreshLoading(true);
  try {
    const payload = await fetchJson("/api/simulations?limit=1000");
    serverSimulation.jobs = payload.items || [];
    renderServerJobsList(serverSimulation.jobs);
    loaded = true;
  } catch (_) {
    serverSimulation.available = false;
    renderServerJobsList([]);
  } finally {
    if (showFeedback) {
      const remainingMs = Math.max(0, 500 - (performance.now() - feedbackStartedAt));
      if (remainingMs > 0) await new Promise((resolve) => setTimeout(resolve, remainingMs));
      setServerJobsRefreshLoading(false);
      if (loaded) showServerJobsRefreshDone();
    }
  }
}

function renderServerSimulation(simulation) {
  if (!SERVER_SIMULATION_MODE || !simulation?.id) return;
  serverSimulation.id = simulation.id;
  serverSimulation.running = !isServerSimulationTerminal(simulation.status);
  if (!serverSimulation.running) serverSimulation.paused = false;
  if (!serverSimulation.startedAtMs && simulation.created_at) serverSimulation.startedAtMs = simulation.created_at * 1000;
  applyServerRawProgress(simulation);
  const info = serverSimulationText(simulation);
  const elapsedSeconds = serverElapsedSeconds(simulation);
  if (info.currentValue) currentPositionValue.textContent = info.currentValue;
  if (info.currentAero) currentAeroEarned.textContent = info.currentAero;
  const rowsDone = Number(info.rows || 0);
  const totalRows = estimateServerTotalRows(simulation);
  setServerSimulationProgressNotice({
    status: serverSimulation.paused ? "paused" : (simulation.status || (serverSimulation.running ? "running" : "unknown")),
    elapsed: formatCompactDurationSeconds(elapsedSeconds),
    processing: serverProcessingTimestamp(simulation),
    rows: totalRows > 0 ? `${rowsDone} / ${totalRows}` : (rowsDone > 0 ? `${rowsDone} / —` : "—"),
    eta: serverEtaText(simulation, elapsedSeconds, rowsDone, totalRows),
  });
  const index = serverSimulation.jobs.findIndex((item) => item.id === simulation.id);
  if (index >= 0) serverSimulation.jobs[index] = simulation;
  else serverSimulation.jobs.unshift(simulation);
  renderServerJobsList(serverSimulation.jobs);
  syncOpenedSimulation(simulation);
  renderServerResultTable(simulation);
  updateSimulationControls();
}

function stopServerSimulationPolling() {
  if (serverSimulation.pollTimer) clearTimeout(serverSimulation.pollTimer);
  serverSimulation.pollTimer = null;
}
function stopServerSimulationEvents() {
  if (serverSimulation.eventSource) serverSimulation.eventSource.close();
  serverSimulation.eventSource = null;
}

async function pollServerSimulation(id) {
  if (!SERVER_SIMULATION_MODE || !id) return;
  try {
    const simulation = await fetchJson(`/api/simulations/${id}`);
    renderServerSimulation(simulation);
    if (isServerSimulationTerminal(simulation.status)) {
      stopServerSimulationPolling();
      loadServerJobs();
    }
  } catch (error) {
    if ((error.status === 429 || error.retryAfterSeconds) && serverSimulation.running) {
      const retryMs = Math.max(5000, error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : (serverSimulation.pollBackoffMs || SERVER_SIMULATION_POLL_MS) * 2);
      serverSimulation.pollBackoffMs = Math.min(60000, retryMs);
      setSimulationNotice({
        status: "Сервер ограничил частоту чтения прогресса.",
        details: `Следующая попытка через ${Math.ceil(retryMs / 1000)}s. Симуляция продолжает считаться на сервере.`,
        estimate: "",
      });
      serverSimulation.pollTimer = setTimeout(() => pollServerSimulation(id), retryMs);
      return;
    }
    serverSimulation.running = false;
    stopServerSimulationPolling();
    setSimulationNotice(`Не могу прочитать серверную симуляцию: ${error.message}`);
    updateSimulationControls();
  }
}

function watchServerSimulation(id) {
  stopServerSimulationPolling();
  stopServerSimulationEvents();
  serverSimulation.paused = false;
  serverSimulation.pollBackoffMs = Math.max(5000, SERVER_SIMULATION_POLL_MS);
  pollServerSimulation(id);
  const adminToken = typeof localStorage !== "undefined" ? localStorage.getItem("walletWatchAdminToken") : "";
  const eventUrl = adminToken
    ? `/api/simulations/${id}/events?admin_token=${encodeURIComponent(adminToken)}`
    : `/api/simulations/${id}/events`;
  const source = new EventSource(eventUrl);
  source.addEventListener("simulation", (event) => {
    try {
      const simulation = JSON.parse(event.data);
      renderServerSimulation(simulation);
      if (isServerSimulationTerminal(simulation.status)) {
        stopServerSimulationEvents();
        stopServerSimulationPolling();
      }
      serverSimulation.pollBackoffMs = Math.max(5000, SERVER_SIMULATION_POLL_MS);
    } catch (_) {}
  });
  source.addEventListener("terminal", () => {
    stopServerSimulationEvents();
    stopServerSimulationPolling();
    loadServerJobs();
  });
  source.onerror = () => {
    stopServerSimulationEvents();
    const delayMs = Math.max(5000, serverSimulation.pollBackoffMs || SERVER_SIMULATION_POLL_MS);
    serverSimulation.pollBackoffMs = Math.min(60000, delayMs * 2);
    serverSimulation.pollTimer = setTimeout(() => pollServerSimulation(id), delayMs);
  };
  serverSimulation.eventSource = source;
}

function pauseServerSimulation() {
  if (!SERVER_SIMULATION_MODE || !serverSimulation.id || !serverSimulation.running) return;
  stopServerSimulationPolling();
  stopServerSimulationEvents();
  serverSimulation.running = false;
  serverSimulation.paused = true;
  setSimulationNotice({ status: "Пауза.", details: "Серверная симуляция поставлена на паузу.", estimate: "" });
  updateSimulationControls();
}

function resumeServerSimulation() {
  if (!SERVER_SIMULATION_MODE || !serverSimulation.id || !serverSimulation.paused) return;
  serverSimulation.running = true;
  serverSimulation.paused = false;
  serverSimulation.rawRows = [];
  updateSimulationControls();
  watchServerSimulation(serverSimulation.id);
}

async function loadInitialServerSimulations() {
  if (!SERVER_SIMULATION_MODE) return;
  try {
    await loadServerJobs();
    updateSimulationControls();
  } catch (_) {
    serverSimulation.available = false;
    updateSimulationControls();
  }
}

async function openServerSimulation(id) {
  if (!SERVER_SIMULATION_MODE || !id) return;
  const simulation = await fetchJson(`/api/simulations/${id}`);
  openSimulationResultTab(simulation);
}

async function cancelServerSimulation(id) {
  if (!SERVER_SIMULATION_MODE || !id) return;
  const simulation = await fetchJson(`/api/simulations/${id}/cancel`, { method: "POST" });
  if (serverSimulation.id === id) {
    renderServerSimulation(simulation);
    stopServerSimulationPolling();
  } else {
    syncOpenedSimulation(simulation);
  }
  serverSimulation.paused = false;
  await loadServerJobs();
}

async function deleteServerSimulation(id, row = null) {
  if (!SERVER_SIMULATION_MODE || !id) return;
  const deleteAnimation = animateServerJobDelete(row);
  try {
    await fetchJson(`/api/simulations/${id}`, { method: "DELETE" });
    serverSimulation.jobs = serverSimulation.jobs.filter((item) => item.id !== id);
    closeSimulationResultTab(id);
    if (serverSimulation.id === id) {
      serverSimulation.id = null;
      serverSimulation.running = false;
      serverSimulation.paused = false;
      serverSimulation.rawRows = [];
      stopServerSimulationPolling();
      setSimulationNotice("Server simulation deleted.");
      currentPositionValue.textContent = "$0.00";
      currentAeroEarned.textContent = "$0.00";
      updateSimulationControls();
    }
    await deleteAnimation;
    if (row?.isConnected) row.remove();
    if (!serverSimulation.jobs.length) renderServerJobsList([]);
  } catch (error) {
    if (row) {
      row.classList.remove("deleting");
      row.style.maxHeight = "";
    }
    throw error;
  }
}

async function startServerSimulation() {
  if (!SERVER_SIMULATION_MODE) return startSimulation();
  if (serverSimulation.running && !serverSimulation.paused) {
    pauseServerSimulation();
    return;
  }
  if (serverSimulation.paused) {
    resumeServerSimulation();
    return;
  }
  if (!serverSimulation.available) {
    setSimulationNotice("Серверный API недоступен. Запусти приложение через scripts/serve_with_rpc.py.");
    return;
  }
  const inputTimestamp = parseInputTime(simStartInput.value);
  const endTimestamp = parseInputTime(simEndInput.value);
  if (Number.isNaN(inputTimestamp) || Number.isNaN(endTimestamp)) {
    setSimulationNotice("Не могу разобрать даты. Используй формат 2026-02-01 00:00.");
    return;
  }
  if (endTimestamp <= inputTimestamp) {
    setSimulationNotice("Дата конца должна быть позже даты старта.");
    return;
  }
  const depositUsdc = parseNumericInput(depositInput.value);
  const rangePercent = parseRangePercent(rangePercentInput.value);
  if (!Number.isFinite(depositUsdc) || depositUsdc <= 0) {
    setSimulationNotice("Сумма депозита должна быть положительным числом.");
    return;
  }
  if (!Number.isFinite(rangePercent) || rangePercent <= 0 || rangePercent >= 100) {
    setSimulationNotice("Диапазон должен быть положительным числом меньше 100%.");
    return;
  }
  resetSimulationRows();
  serverSimulation.running = true;
  serverSimulation.paused = false;
  serverSimulation.startedAtMs = Date.now();
  serverSimulation.rawRows = [];
  if (state.rows.length) {
    const startIndex = rowIndexForTimestamp(inputTimestamp, "atOrAfter");
    const endIndex = rowIndexForTimestamp(endTimestamp, "atOrBefore");
    if (endIndex <= startIndex) {
      setSimulationNotice("Дата конца должна быть позже даты старта.");
      serverSimulation.running = false;
      updateSimulationControls();
      return;
    }
    state.sim.startIndex = startIndex;
    state.sim.endIndex = endIndex;
    state.sim.currentIndex = startIndex;
    simStartInput.value = fmtInputTime(state.rows[startIndex].time);
    simEndInput.value = fmtInputTime(state.rows[endIndex].time);
    zoomToSimulationRange(startIndex, endIndex);
    draw();
  }
  updateSimulationControls();
  const totalRows = Math.max(0, state.sim.endIndex - state.sim.startIndex + 1);
  setServerSimulationProgressNotice({
    status: "starting",
    elapsed: "0s",
    processing: "—",
    rows: totalRows > 0 ? `0 / ${totalRows}` : "0 / —",
    eta: "—",
  });
  try {
    const simulation = await fetchJson("/api/simulations", {
      method: "POST",
      body: JSON.stringify({
        start: fmtInputTime(inputTimestamp),
        end: fmtInputTime(endTimestamp),
        deposit: String(depositUsdc),
        rangePct: rangePercent,
        progressEverySeconds: 2,
      }),
    });
    renderServerSimulation(simulation);
    watchServerSimulation(simulation.id);
    loadServerJobs();
  } catch (error) {
    serverSimulation.running = false;
    serverSimulation.paused = false;
    setSimulationNotice(`Не удалось запустить серверную симуляцию: ${error.message}`);
    updateSimulationControls();
  }
}

function ensureActiveSimulation(runToken, requireStarted = true) {
  if (runToken !== null && (runToken !== state.sim.runToken || (requireStarted && !state.sim.started))) {
    throw new Error("Simulation was reset");
  }
}

async function buildSimulationRow(index, eventName, blockOverride = null, runToken = null) {
  return await simulationEngine.buildSimulationRow(index, eventName, blockOverride, runToken);
}

async function startSimulation() {
  if (state.sim.initializing) {
    state.sim.initializing = false;
    state.sim.autoRunning = false;
    state.sim.runToken += 1;
    state.sim.autoLoopId += 1;
    updateSimulationControls();
    setSimulationNotice("Старт симуляции отменен. Нажми START, чтобы начать заново.");
    return;
  }
  if (state.sim.started) {
    if (state.sim.stopped) {
      state.sim.stopped = false;
    }
    state.sim.autoRunning = !state.sim.autoRunning;
    updateSimulationControls();
    if (state.sim.autoRunning) {
      state.sim.autoLoopId += 1;
      runAutoSimulationLoop(state.sim.runToken, state.sim.autoLoopId);
    } else {
      setSimulationNotice({ status: "Пауза.", details: simulationProgressText(), estimate: "" });
    }
    return;
  }
  if (!state.rows.length) return;
  resetSimulationRows();
  const inputTimestamp = parseInputTime(simStartInput.value);
  if (Number.isNaN(inputTimestamp)) {
    setSimulationNotice("Не могу разобрать дату старта. Используй формат 2026-02-01 00:00.");
    return;
  }
  const endTimestamp = parseInputTime(simEndInput.value);
  if (Number.isNaN(endTimestamp)) {
    setSimulationNotice("Не могу разобрать дату конца. Используй формат 2026-04-30 23:59.");
    return;
  }
  const startIndex = rowIndexForTimestamp(inputTimestamp, "atOrAfter");
  const endIndex = rowIndexForTimestamp(endTimestamp, "atOrBefore");
  if (endIndex <= startIndex) {
    setSimulationNotice("Дата конца должна быть позже даты старта.");
    return;
  }
  const startRow = state.rows[startIndex];
  const depositUsdc = parseNumericInput(depositInput.value);
  if (!Number.isFinite(depositUsdc) || depositUsdc <= 0) {
    setSimulationNotice("Сумма депозита должна быть положительным числом.");
    return;
  }
  const rangePercent = parseRangePercent(rangePercentInput.value);
  if (!Number.isFinite(rangePercent) || rangePercent <= 0 || rangePercent >= 100) {
    setSimulationNotice("Диапазон должен быть положительным числом меньше 100%.");
    return;
  }
  state.sim.depositUsdc = depositUsdc;
  state.sim.rangeWidth = rangePercent / 100;
  depositInput.value = fmtDeposit(depositUsdc);
  rangePercentInput.value = fmtPercent(rangePercent);
  state.sim.currentIndex = startIndex;
  state.sim.startIndex = startIndex;
  state.sim.endIndex = endIndex;
  state.sim.stepDurations = [];
  state.sim.etaMs = 0;
  simStartInput.value = fmtInputTime(startRow.time);
  simEndInput.value = fmtInputTime(state.rows[endIndex].time);
  zoomToSimulationRange(startIndex, endIndex);
  state.sim.initializing = true;
  state.sim.autoRunning = true;
  const runToken = state.sim.runToken;
  updateSimulationControls();
  draw();

  setSimulationNotice("Читаю historical state Base RPC и цену AERO...");
  try {
    const block = await findBlockAtOrAfter(Math.floor(new Date(startRow.time).getTime() / 1000), 1);
    ensureActiveSimulation(runToken, false);
    const slot = await readPoolSlot0(POOL_ADDRESS, block.number);
    ensureActiveSimulation(runToken, false);
    const startPrice = priceFromSqrtX96(slot.sqrtPriceX96);
    const plan = computePositionPlan(depositUsdc, startPrice, state.sim.rangeWidth);
    state.sim.tickLower = plan.tickLower;
    state.sim.tickUpper = plan.tickUpper;
    state.sim.anchorTick = plan.anchorTick;
    state.sim.startGridTick = plan.tickLower;
    state.sim.rangeStepTicks = Math.max(
      AERODROME_TICK_SPACING,
      Math.round((plan.tickUpper - plan.tickLower) / AERODROME_TICK_SPACING) * AERODROME_TICK_SPACING,
    );
    state.sim.liquidityRaw = plan.liquidityRaw;
    state.sim.liquidityHuman = plan.liquidityHuman;
    const rewardState = await readRewardInside(block.number, state.sim.tickLower, state.sim.tickUpper);
    ensureActiveSimulation(runToken, false);
    state.sim.rewardStart = rewardState.rewardInside;
    state.sim.rewardLast = rewardState.rewardInside;
    state.sim.feeGrowthInside0Last = rewardState.feeGrowthInside0X128 || 0n;
    state.sim.feeGrowthInside1Last = rewardState.feeGrowthInside1X128 || 0n;
    const positionActive = rewardState.tick >= state.sim.tickLower && rewardState.tick < state.sim.tickUpper;
    state.sim.feeDilutionLiquidityLast = positionActive ? rewardState.activeLiquidity : 0n;
    state.sim.rewardDilutionLiquidityLast = positionActive ? rewardState.activeLiquidity : rewardState.stakedLiquidity;
    state.sim.aeroUnharvested = 0;
    state.sim.aeroBaseUnharvested = 0;
    state.sim.aeroHaircutUnharvested = 0;
    state.sim.started = true;
    state.sim.initializing = false;
    state.sim.rows = [await buildSimulationRow(startIndex, "deposit", block, runToken)];
    ensureActiveSimulation(runToken);
    setSimulationNotice({ status: "Симуляция запущена.", details: simulationProgressText(), estimate: "" });
    renderSimulationTable(true);
    state.sim.autoLoopId += 1;
    runAutoSimulationLoop(state.sim.runToken, state.sim.autoLoopId);
  } catch (error) {
    if (runToken !== state.sim.runToken) return;
    resetSimulationRows();
    setSimulationNotice(`Симуляция остановлена: ${error.message}`);
  }
}
async function stepSimulationForward(options = {}) {
  return await simulationEngine.stepForward(options);
}
function stepSimulationBack() {
  if (!state.sim.started || state.sim.autoRunning || state.sim.stepInProgress || state.sim.rows.length <= 1) return;
  state.sim.rows.pop();
  state.sim.currentIndex = state.sim.rows[state.sim.rows.length - 1].index;
  state.sim.activeRowIndex = state.sim.currentIndex;
  applySimState(state.sim.rows[state.sim.rows.length - 1].stateAfter);
  state.sim.stopped = false;
  setSimulationNotice({ status: "Шаг назад.", details: simulationProgressText(), estimate: "" });
  renderSimulationTable();
}

function resetSimulation() {
  resetSimulationRows();
  serverSimulation.rawRows = [];
  setSimulationNotice("Симуляция сброшена. Нажми START, чтобы начать заново.");
}

function resetOrStopSimulation() {
  if (SERVER_SIMULATION_MODE && serverSimulation.id && (serverSimulation.running || serverSimulation.paused)) {
    cancelServerSimulation(serverSimulation.id).catch((error) => {
      setSimulationNotice(`Не удалось остановить серверную симуляцию: ${error.message}`);
    });
    return;
  }
  resetSimulation();
}

async function runAutoSimulationLoop(runToken, loopId) {
  return await simulationEngine.runAutoLoop(runToken, loopId);
}

canvas.addEventListener("wheel", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const padLeft = 72;
  const padRight = 72;
  const plotW = canvas.clientWidth - padLeft - padRight;
  const ratio = Math.min(1, Math.max(0, (x - padLeft) / plotW));
  event.preventDefault();
  state.hoverIndex = -1;
  zoomAt(ratio, event.deltaY);
  state.releaseRows = null;
  updateMetrics(getVisibleRows());
  draw();
}, { passive: false });

canvas.addEventListener("click", (event) => {
  if (state.suppressNextClick) {
    state.suppressNextClick = false;
    return;
  }
  if (state.sim.started || state.isDragging || !state.visible.length) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const padLeft = 72;
  const padRight = 72;
  const plotW = canvas.clientWidth - padLeft - padRight;
  const ratio = Math.min(1, Math.max(0, (x - padLeft) / plotW));
  const visibleRows = getVisibleRows();
  const index = Math.round(ratio * (visibleRows.length - 1));
  const row = visibleRows[index];
  if (row) {
    setActiveSimulationTime(row.index);
  }
});

function updateDrag(event) {
  event.preventDefault();
  state.dragMoved = true;
  const padLeft = 72;
  const padRight = 72;
  const plotW = canvas.clientWidth - padLeft - padRight;
  const deltaRatio = -(event.clientX - state.dragX) / plotW * (state.dragEnd - state.dragStart);
  panBy(deltaRatio);
  state.hoverIndex = -1;
  draw();
}

canvas.addEventListener("mousemove", (event) => {
  if (state.isDragging) return;
  const rows = state.visible;
  if (!rows.length) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const padLeft = 72;
  const padRight = 72;
  const plotW = canvas.clientWidth - padLeft - padRight;
  const ratio = Math.min(1, Math.max(0, (x - padLeft) / plotW));
  state.hoverIndex = Math.round(ratio * (rows.length - 1));
  draw();
});

canvas.addEventListener("mouseleave", () => {
  state.hoverIndex = -1;
  if (!state.isDragging) draw();
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 0 || state.zoomEnd - state.zoomStart >= 1) return;
  event.preventDefault();
  state.hoverIndex = -1;
  state.isDragging = true;
  state.dragX = event.clientX;
  state.dragMoved = false;
  state.dragStart = state.zoomStart;
  state.dragEnd = state.zoomEnd;
  state.dragSamples = buildDragSamples();
  state.releaseRows = null;
  canvas.style.cursor = "grabbing";
  document.body.style.cursor = "grabbing";
});

window.addEventListener("mousemove", (event) => {
  if (!state.isDragging) return;
  updateDrag(event);
});

function finishDrag() {
  if (!state.isDragging) return;
  const finalRows = getVisibleDragRows();
  state.isDragging = false;
  if (state.dragMoved) state.suppressNextClick = true;
  state.dragSamples = [];
  state.releaseRows = finalRows;
  canvas.style.cursor = "";
  document.body.style.cursor = "";
  updateMetrics(getVisibleRows());
  draw();
}

window.addEventListener("mouseup", finishDrag);
window.addEventListener("blur", finishDrag);

function ratioOnNavigator(event) {
  const rect = rangeTrack.getBoundingClientRect();
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
}

function startNavigatorDrag(event) {
  const size = state.zoomEnd - state.zoomStart;
  if (size >= 1) return;
  event.preventDefault();
  event.stopPropagation();
  state.isNavigatorDragging = true;
  state.navigatorDragX = event.clientX;
  state.navigatorDragStart = state.zoomStart;
  rangeWindow.style.cursor = "grabbing";
  document.body.style.cursor = "grabbing";
}

function updateNavigatorDrag(event) {
  if (!state.isNavigatorDragging) return;
  event.preventDefault();
  const rect = rangeTrack.getBoundingClientRect();
  const deltaRatio = (event.clientX - state.navigatorDragX) / Math.max(1, rect.width);
  setZoomWindow(state.navigatorDragStart + deltaRatio);
}

function finishNavigatorDrag() {
  if (!state.isNavigatorDragging) return;
  state.isNavigatorDragging = false;
  rangeWindow.style.cursor = "";
  document.body.style.cursor = "";
}

rangeTrack.addEventListener("mousedown", (event) => {
  if (event.target === rangeWindow) return;
  const size = state.zoomEnd - state.zoomStart;
  if (size >= 1) return;
  event.preventDefault();
  setZoomWindow(ratioOnNavigator(event) - size / 2);
});

rangeWindow.addEventListener("mousedown", startNavigatorDrag);
window.addEventListener("mousemove", updateNavigatorDrag);
window.addEventListener("mouseup", finishNavigatorDrag);
window.addEventListener("blur", finishNavigatorDrag);

document.querySelectorAll(".filters button").forEach((button) => {
  button.addEventListener("click", () => updateRange(button.dataset.range));
});

if (appTabNew) appTabNew.addEventListener("click", () => setAppTab("new"));
if (appTabHistory) appTabHistory.addEventListener("click", () => setAppTab("history"));
if (resultTabs) {
  resultTabs.addEventListener("click", (event) => {
    const tab = event.target.closest(".projectResultTab");
    if (!tab?.dataset?.resultId) return;
    const action = event.target.closest("button")?.dataset?.tabAction;
    if (action === "close") closeSimulationResultTab(tab.dataset.resultId);
    else setAppTab(resultTabId(tab.dataset.resultId));
  });
}

simStartInput.addEventListener("change", () => {
  const timestamp = parseInputTime(simStartInput.value);
  if (Number.isNaN(timestamp)) {
    setSimulationNotice("Не могу разобрать дату старта. Используй формат 2026-02-01 00:00.");
    return;
  }
  resetSimulationRows();
  setSimulationStart(rowIndexForTimestamp(timestamp, "atOrAfter"));
});
simStartInput.addEventListener("pointerdown", () => setActiveTimeInput("start"));
simStartInput.addEventListener("click", () => setActiveTimeInput("start"));
simStartInput.addEventListener("focus", () => setActiveTimeInput("start"));
simStartInput.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  setActiveTimeInput("start");
  nudgeTimeInput("start", event.key === "ArrowUp" ? 1 : -1);
});

simEndInput.addEventListener("change", () => {
  const timestamp = parseInputTime(simEndInput.value);
  if (Number.isNaN(timestamp)) {
    setSimulationNotice("Не могу разобрать дату конца. Используй формат 2026-04-30 23:59.");
    return;
  }
  resetSimulationRows();
  setSimulationEnd(rowIndexForTimestamp(timestamp, "atOrBefore"));
});
simEndInput.addEventListener("pointerdown", () => setActiveTimeInput("end"));
simEndInput.addEventListener("click", () => setActiveTimeInput("end"));
simEndInput.addEventListener("focus", () => setActiveTimeInput("end"));
simEndInput.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  setActiveTimeInput("end");
  nudgeTimeInput("end", event.key === "ArrowUp" ? 1 : -1);
});

depositInput.addEventListener("change", () => {
  const depositUsdc = parseNumericInput(depositInput.value);
  if (Number.isFinite(depositUsdc) && depositUsdc > 0) depositInput.value = fmtDeposit(depositUsdc);
  resetSimulationRows();
});
rangePercentInput.addEventListener("change", () => {
  const rangePercent = parseRangePercent(rangePercentInput.value);
  if (Number.isFinite(rangePercent) && rangePercent > 0 && rangePercent < 100) {
    rangePercentInput.value = fmtPercent(rangePercent);
  }
  resetSimulationRows();
});
runSimulation.addEventListener("click", startServerSimulation);
if (resetSimulationButton) resetSimulationButton.addEventListener("click", resetOrStopSimulation);
if (refreshServerJobs) refreshServerJobs.addEventListener("click", () => loadServerJobs({ feedback: true }));
if (serverJobsList) {
  serverJobsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    const row = event.target.closest(".serverJob");
    const id = row?.dataset?.id;
    if (!id) return;
    if (!button) {
      openServerSimulation(id);
      return;
    }
    const action = button.dataset.action;
    if (action === "cancel") cancelServerSimulation(id);
    if (action === "delete") deleteServerSimulation(id, row).catch((error) => console.error(error));
  });
}
stepForward.addEventListener("click", () => {
  stepSimulationForward();
});
stepBack.addEventListener("click", stepSimulationBack);

simTableBody.addEventListener("mousemove", (event) => {
  const row = event.target.closest("tr[data-index]");
  if (!row) return;
  const nextIndex = Number(row.dataset.index);
  if (state.sim.tableHoverIndex !== nextIndex) {
    state.sim.tableHoverIndex = nextIndex;
    draw();
  }
});

simTableBody.addEventListener("mouseleave", () => {
  state.sim.tableHoverIndex = -1;
  draw();
});

window.addEventListener("resize", draw);

fetch(CSV_FILE)
  .then((response) => {
    if (!response.ok) throw new Error(`CSV load failed: ${response.status}`);
    return response.text();
  })
  .then((text) => {
    const csvRows = parseCsv(text);
    state.dataQuality = analyzeDataQuality(csvRows);
    state.dataQuality.source = CSV_FILE;
    state.rows = buildCompleteMinuteRows(csvRows);
    state.dataQuality.minuteRowCount = state.rows.length;
    statusEl.textContent = dataQualityStatus(state.dataQuality);
    statusEl.title = dataQualityTitle(state.dataQuality);
    setSimulationStart(0);
    setSimulationEnd(state.rows.length - 1);
    resetSimulationRows();
    setActiveTimeInput("start");
    updateRange("all");
    loadInitialServerSimulations();
  })
  .catch((error) => {
    statusEl.textContent = "Ошибка загрузки CSV";
    console.error(error);
  });

globalThis.getSimulationRawRows = getSimulationRawRows;
globalThis.getSimulationDataQuality = getSimulationDataQuality;
globalThis.buildCompleteMinuteRows = buildCompleteMinuteRows;
