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
    lastExitBlockNumber: 0,
    lastExitLogIndex: -1,
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
    rows: [],
    blockCache: new Map(),
    blockByNumberCache: new Map(),
    aeroPriceCache: new Map(),
    timing: { startedAtMs: 0, items: {} },
    aeroPriceReliability: 100,
    aeroPriceAgeSeconds: 0,
    tableHoverIndex: -1,
    activeRowIndex: -1,
    startupStage: "",
    elapsedStartedAtMs: 0,
    elapsedTimer: null,
    initialRangeReady: false,
    skeletonVisible: false,
    chartPriceMin: null,
    chartPriceMax: null,
    initialChartView: null,
    userAdjustedChartView: false,
  },
  resultChart: {
    simulationId: "",
    zoomStart: 0,
    zoomEnd: 1,
    hoverIndex: -1,
    isDragging: false,
    dragX: 0,
    dragStart: 0,
    dragEnd: 1,
  },
};

const canvas = document.getElementById("priceChart");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");
const simTooltip = document.getElementById("simTooltip");
const tableTooltip = document.getElementById("tableTooltip");
const resetChartViewButton = document.getElementById("resetChartView");
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
const currentRewardDiv = document.getElementById("currentRewardDiv");
const currentRewardLabel = document.getElementById("currentRewardLabel");
const currentRewardValue = document.getElementById("currentRewardValue");
const currentTotalValue = document.getElementById("currentTotalValue");
const simulationModeSelect = document.getElementById("simulationModeSelect");
const simNotice = document.getElementById("simNotice");
const simTableWrap = document.getElementById("simTableWrap");
const simTableBody = document.getElementById("simTableBody");
const backgroundProgressPanel = document.getElementById("backgroundProgressPanel");
const serverBackgroundOverlay = document.getElementById("serverBackgroundOverlay");
const serverBackgroundOverlayText = document.getElementById("serverBackgroundOverlayText");
const openLiveViewButton = document.getElementById("openLiveView");
const closeLiveViewButton = document.getElementById("closeLiveView");
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
const resultChartWrap = document.getElementById("resultChartWrap");
const resultPriceChart = document.getElementById("resultPriceChart");
const resultChartCtx = resultPriceChart?.getContext("2d");
const resultLastRow = document.getElementById("resultLastRow");
const resultTableWrap = document.getElementById("resultTableWrap");
const resultTableBody = document.getElementById("resultTableBody");
const resultEmpty = document.getElementById("resultEmpty");
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const AERODROME_TICK_SPACING = 100;
const PRICE_DECIMAL_FACTOR = 1e12;
const POINTS_PER_PIXEL = 0.55;
const DEFAULT_SIM_RANGE_WIDTH = 0.01;
const MIN_CHART_ZOOM_ROWS = 30;
const CSV_PROCESSING_GRACE_MS = 2500;
const MINUTE_AXIS_MAX_MINUTES = 180;
const RUNTIME_CONFIG = globalThis.SERVER_SIM_CONFIG_CLIENT || {};
const LP_FEE_RATE = Number(RUNTIME_CONFIG.lpFeeRate ?? 0.0005);
const REBALANCE_MANUAL_FEE_BPS = Number(RUNTIME_CONFIG.rebalanceManualFeeBps ?? 1);
const REBALANCE_GAS_UNITS = BigInt(RUNTIME_CONFIG.rebalanceGasUnits ?? 1450000);
const REBALANCE_L1_DATA_FEE_ETH = Number(RUNTIME_CONFIG.rebalanceL1DataFeeEth ?? 0.000012);
const REBALANCE_FALLBACK_SLIPPAGE_BPS = Number(RUNTIME_CONFIG.rebalanceFallbackSlippageBps ?? 5);
const REBALANCE_CONFIRMATION_BUFFER_BPS = Number(RUNTIME_CONFIG.rebalanceConfirmationBufferBps ?? 5);
const REBALANCE_CONFIRMATION_MINUTES = Number(RUNTIME_CONFIG.rebalanceConfirmationMinutes ?? 2);
const AERO_IMPACT_HAIRCUT_MAX = Number(RUNTIME_CONFIG.aeroImpactHaircutMax ?? 0.5);
const SERVER_SIMULATION_POLL_MS = Number(RUNTIME_CONFIG.serverSimulationPollMs ?? 2500);
const BASE_RPC_URLS = ["/rpc"];
const IS_SERVER_WORKER = Boolean(globalThis.SERVER_SIM_CONFIG_CLIENT && globalThis.SERVER_SIM_CONFIG_CLIENT.id);
const SERVER_SIMULATION_MODE = !IS_SERVER_WORKER;
let baseRpcIndex = 0;
const POOL_ADDRESS = "0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59";
const AERO_USDC_POOL_ADDRESS = "0xbe00ff35af70e8415d0eb605a286d8a45466a4c1";
const AERO_SLIPSTREAM_QUOTER = "0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0";
const MULTICALL3_ADDRESS = "0xca11bde05977b3631167028862be2a173976ca11";
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
  feeGrowthGlobal0X128: "0xf3058399",
  feeGrowthGlobal1X128: "0x46141319",
  ticks: "0xf30dba93",
  quoteExactInputSingle: "0x9e7defe6",
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  aggregate3: "0x82ad56cb",
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
  lastSimulation: null,
  uiMode: "live",
  liveViewOpen: true,
  finalResultFetched: false,
  jobsLoadRequestId: 0,
  jobsLoadPromise: null,
  jobsLoadedAtMs: 0,
  jobsLoaded: false,
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
  fmtAxisMinute,
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
  rewardGrowthInsideFromState,
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

function isPlanLimitError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  return msg.includes("archive") || msg.includes("plan") || msg.includes("allowance") || msg.includes("limit") || msg.includes("method not allowed") || msg.includes("debug") || msg.includes("trace");
}

function resetSimulationTiming() {
  state.sim.timing = { startedAtMs: performance.now(), items: {} };
}

function recordSimulationTiming(name, startedAt) {
  const elapsedMs = Math.max(0, performance.now() - startedAt);
  const items = state.sim.timing.items || (state.sim.timing.items = {});
  const item = items[name] || { count: 0, totalMs: 0, maxMs: 0 };
  item.count += 1;
  item.totalMs += elapsedMs;
  item.maxMs = Math.max(item.maxMs, elapsedMs);
  items[name] = item;
}

function getSimulationTiming() {
  const items = Object.entries(state.sim.timing.items || {}).map(([name, item]) => ({
    name,
    count: item.count,
    totalMs: Number(item.totalMs.toFixed(1)),
    avgMs: Number((item.totalMs / Math.max(1, item.count)).toFixed(1)),
    maxMs: Number(item.maxMs.toFixed(1)),
  })).sort((a, b) => b.totalMs - a.totalMs);
  return {
    elapsedMs: state.sim.timing.startedAtMs ? Number((performance.now() - state.sim.timing.startedAtMs).toFixed(1)) : 0,
    items,
  };
}

function chartPriceBounds(rows) {
  const bounds = priceBounds(rows);
  const useSimulationInitialView = hasSimulationInitialChartView() && !state.sim.userAdjustedChartView;
  if (useSimulationInitialView && Number.isFinite(state.sim.chartPriceMin)) bounds.min = Math.min(bounds.min, state.sim.chartPriceMin);
  if (useSimulationInitialView && Number.isFinite(state.sim.chartPriceMax)) bounds.max = Math.max(bounds.max, state.sim.chartPriceMax);
  if (state.sim.started && !state.sim.userAdjustedChartView) {
    const prices = simRangePrices();
    bounds.min = Math.min(bounds.min, prices.lower);
    bounds.max = Math.max(bounds.max, prices.upper);
  }
  return bounds;
}

function hasSimulationInitialChartView() {
  const view = state.sim.initialChartView;
  return Boolean(view && Number.isFinite(view.zoomStart) && Number.isFinite(view.zoomEnd));
}

function updateResetChartViewButton() {
  if (!resetChartViewButton) return;
  const simulationActive = state.sim.started || state.sim.initializing || state.sim.autoRunning || serverSimulation.running || serverSimulation.paused;
  resetChartViewButton.hidden = !(simulationActive && state.sim.userAdjustedChartView && hasSimulationInitialChartView());
}

function captureSimulationInitialChartView() {
  state.sim.initialChartView = {
    zoomStart: state.zoomStart,
    zoomEnd: state.zoomEnd,
    chartPriceMin: state.sim.chartPriceMin,
    chartPriceMax: state.sim.chartPriceMax,
  };
  state.sim.userAdjustedChartView = false;
  updateResetChartViewButton();
}

function updateSimulationInitialChartBounds() {
  if (!hasSimulationInitialChartView()) return;
  state.sim.initialChartView.chartPriceMin = state.sim.chartPriceMin;
  state.sim.initialChartView.chartPriceMax = state.sim.chartPriceMax;
}

function resetToSimulationInitialChartView() {
  if (!hasSimulationInitialChartView()) return;
  const view = state.sim.initialChartView;
  state.zoomStart = view.zoomStart;
  state.zoomEnd = view.zoomEnd;
  state.sim.chartPriceMin = view.chartPriceMin;
  state.sim.chartPriceMax = view.chartPriceMax;
  state.sim.userAdjustedChartView = false;
  state.hoverIndex = -1;
  state.releaseRows = null;
  updateMetrics(getVisibleRows());
  updateResetChartViewButton();
  draw();
}

function setSimulationChartPriceBounds(startIndex, endIndex) {
  if (!Number.isFinite(state.sim.tickLower) || !Number.isFinite(state.sim.tickUpper)) return;
  const start = Math.max(0, Math.min(startIndex, endIndex));
  const end = Math.min(state.rows.length - 1, Math.max(startIndex, endIndex));
  const rows = state.rows.slice(start, end + 1);
  if (!rows.length) return;
  const bounds = priceBounds(rows);
  const spanTicks = Math.max(AERODROME_TICK_SPACING, state.sim.tickUpper - state.sim.tickLower);
  let min = Math.min(bounds.min, priceForTick(state.sim.tickLower));
  let max = Math.max(bounds.max, priceForTick(state.sim.tickUpper));
  rows.forEach((row) => {
    [row.low, row.high].forEach((price) => {
      if (!Number.isFinite(price) || price <= 0) return;
      const range = tickRangeAroundTick(tickForPrice(price), spanTicks);
      min = Math.min(min, priceForTick(range.tickLower));
      max = Math.max(max, priceForTick(range.tickUpper));
    });
  });
  state.sim.chartPriceMin = min;
  state.sim.chartPriceMax = max;
  updateSimulationInitialChartBounds();
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
      if (payload.error) {
        const err = new Error(payload.error.message || "Base RPC error");
        if (isPlanLimitError(err)) err.isPlanLimit = true;
        throw err;
      }
      return payload.result;
    } catch (error) {
      lastError = error;
      if (error.isPlanLimit) break; // Don't retry on other providers if it's a plan limit (likely same for all if they are proxies)
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
        if (!item || item.error) {
          const err = new Error(item?.error?.message || "Base RPC batch error");
          if (isPlanLimitError(err)) err.isPlanLimit = true;
          throw err;
        }
        return item.result;
      });
    } catch (error) {
      lastError = error;
      if (error.isPlanLimit) break;
      baseRpcIndex += 1;
    }
  }
  throw lastError || new Error("Base RPC batch error");
}

function hexNoPrefix(value) {
  return String(value || "").replace(/^0x/i, "");
}

function abiWord(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function abiAddress(address) {
  return hexNoPrefix(address).toLowerCase().padStart(64, "0");
}

function abiBool(value) {
  return value ? abiWord(1n) : abiWord(0n);
}

function abiBytes(hexData) {
  const clean = hexNoPrefix(hexData);
  const paddedLength = Math.ceil(clean.length / 64) * 64;
  return `${abiWord(BigInt(clean.length / 2))}${clean.padEnd(paddedLength, "0")}`;
}

function encodeAggregate3Call(calls) {
  const heads = [];
  const tails = [];
  let offset = BigInt(32 * calls.length);
  for (const call of calls) {
    const encodedCall = `${abiAddress(call.target)}${abiBool(call.allowFailure)}${abiWord(96n)}${abiBytes(call.callData)}`;
    heads.push(abiWord(offset));
    tails.push(encodedCall);
    offset += BigInt(encodedCall.length / 2);
  }
  return `0x${SELECTORS.aggregate3.slice(2)}${abiWord(32n)}${abiWord(BigInt(calls.length))}${heads.join("")}${tails.join("")}`;
}

function decodeAggregate3Result(data, expectedLength) {
  const clean = hexNoPrefix(data);
  const arrayOffset = Number(BigInt(`0x${clean.slice(0, 64)}`)) * 2;
  const length = Number(BigInt(`0x${clean.slice(arrayOffset, arrayOffset + 64)}`));
  if (length !== expectedLength) throw new Error("Multicall result length mismatch");
  const results = [];
  const base = arrayOffset + 64;
  for (let index = 0; index < length; index += 1) {
    const tupleOffset = Number(BigInt(`0x${clean.slice(base + index * 64, base + (index + 1) * 64)}`)) * 2;
    const tupleStart = base + tupleOffset;
    const success = BigInt(`0x${clean.slice(tupleStart, tupleStart + 64)}`) !== 0n;
    const returnOffset = Number(BigInt(`0x${clean.slice(tupleStart + 64, tupleStart + 128)}`)) * 2;
    const returnLengthOffset = tupleStart + returnOffset;
    const returnLength = Number(BigInt(`0x${clean.slice(returnLengthOffset, returnLengthOffset + 64)}`)) * 2;
    const returnStart = returnLengthOffset + 64;
    if (!success) throw new Error("Multicall subcall failed");
    results.push(`0x${clean.slice(returnStart, returnStart + returnLength)}`);
  }
  return results;
}

async function readPoolStateBatch(tag, callDataItems) {
  const startedAt = performance.now();
  const calls = callDataItems.map((data) => ({
    target: POOL_ADDRESS,
    allowFailure: false,
    callData: data,
  }));
  try {
    const result = await rpcCall("eth_call", [{ to: MULTICALL3_ADDRESS, data: encodeAggregate3Call(calls) }, tag]);
    return decodeAggregate3Result(result, calls.length);
  } catch (error) {
    return await rpcBatch(callDataItems.map((data) => ({
      method: "eth_call",
      params: [{ to: POOL_ADDRESS, data }, tag],
    })));
  } finally {
    recordSimulationTiming("readPoolStateBatch", startedAt);
  }
}

async function getBlock(blockNumber) {
  const cached = state.sim.blockByNumberCache.get(blockNumber);
  if (cached) {
    recordSimulationTiming("getBlock.cacheHit", performance.now());
    return cached;
  }
  const startedAt = performance.now();
  const block = await rpcCall("eth_getBlockByNumber", [blockTag(blockNumber), false]);
  const normalized = {
    number: Number(BigInt(block.number)),
    timestamp: Number(BigInt(block.timestamp)),
    baseFeePerGas: block.baseFeePerGas ? BigInt(block.baseFeePerGas) : 0n,
  };
  state.sim.blockByNumberCache.set(blockNumber, normalized);
  recordSimulationTiming("getBlock.rpc", startedAt);
  return normalized;
}

async function latestBlockNumber() {
  return Number(BigInt(await rpcCall("eth_blockNumber", [])));
}

async function findBlockAtOrAfter(timestampSeconds, afterBlock = 1) {
  const startedAt = performance.now();
  try {
    return await findBlockAtOrAfterWithGetter({
      timestampSeconds,
      afterBlock,
      anchor: BASE_BLOCK_ANCHOR,
      secondsPerBlock: BASE_SECONDS_PER_BLOCK,
      getBlock,
      cache: state.sim.blockCache,
    });
  } finally {
    recordSimulationTiming("findBlockAtOrAfter", startedAt);
  }
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
  const startedAt = performance.now();
  try {
    const data = await rpcCall("eth_call", [{ to: poolAddress, data: SELECTORS.slot0 }, blockTag(blockNumber)]);
    return decodeSlot0(data);
  } finally {
    recordSimulationTiming(poolAddress === AERO_USDC_POOL_ADDRESS ? "readAeroPoolSlot0" : "readPoolSlot0", startedAt);
  }
}

async function readRewardInside(blockNumber, tickLower, tickUpper) {
  const startedAt = performance.now();
  const tag = blockTag(blockNumber);
  const tickLowerData = `${SELECTORS.ticks}${encodeInt24(tickLower)}`;
  const tickUpperData = `${SELECTORS.ticks}${encodeInt24(tickUpper)}`;
  const [slotData, globalData, rateData, reserveData, lastUpdatedData, stakedData, activeLiquidityData, feeGlobal0Data, feeGlobal1Data, lowerTickData, upperTickData] = await readPoolStateBatch(tag, [
    SELECTORS.slot0,
    SELECTORS.rewardGrowthGlobal,
    SELECTORS.rewardRate,
    SELECTORS.rewardReserve,
    SELECTORS.lastUpdated,
    SELECTORS.stakedLiquidity,
    SELECTORS.liquidity,
    SELECTORS.feeGrowthGlobal0X128,
    SELECTORS.feeGrowthGlobal1X128,
    tickLowerData,
    tickUpperData,
  ]);
  const block = await getBlock(blockNumber);
  const slot = decodeSlot0(slotData);
  const storedGlobal = hexToBigInt(globalData);
  const rewardRate = hexToBigInt(rateData);
  const rewardReserve = hexToBigInt(reserveData);
  const lastUpdated = hexToBigInt(lastUpdatedData);
  const stakedLiquidity = hexToBigInt(stakedData);
  const activeLiquidity = hexToBigInt(activeLiquidityData);
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
  const rewardInside = rewardGrowthInsideFromState({
    tickLower,
    tickUpper,
    tickCurrent: slot.tick,
    rewardGrowthGlobalX128: calculatedGlobal,
    lowerTick,
    upperTick,
  }).rewardGrowthInsideX128;
  try {
    return {
      rewardInside,
      stakedLiquidity,
      activeLiquidity,
      tick: slot.tick,
      sqrtPriceX96: slot.sqrtPriceX96,
      block,
      rewardElapsedSeconds,
      rewardReserveCapped: expectedReward > rewardReserve,
      feeGrowthGlobal0X128,
      feeGrowthGlobal1X128,
      ...feeGrowthInside,
    };
  } finally {
    recordSimulationTiming("readRewardInside", startedAt);
  }
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
  const startedAt = performance.now();
  const cached = state.sim.aeroPriceCache.get(blockNumber);
  if (cached) {
    state.sim.aeroPriceReliability = cached.reliability;
    state.sim.aeroPriceAgeSeconds = 0;
    recordSimulationTiming("getAeroPrice.cacheHit", startedAt);
    return cached.price;
  }
  try {
    const [slot, tokenOrder] = await Promise.all([
      readPoolSlot0(AERO_USDC_POOL_ADDRESS, blockNumber),
      getAeroUsdcTokenOrder(blockNumber),
    ]);
    const price = aeroUsdcPriceFromSqrtX96(slot.sqrtPriceX96, tokenOrder);
    if (!Number.isFinite(price) || price <= 0) throw new Error("Failed to fetch on-chain AERO price");
    const reliability = 96;
    state.sim.aeroPriceCache.set(blockNumber, { price, reliability });
    state.sim.aeroPriceReliability = reliability;
    state.sim.aeroPriceAgeSeconds = 0;
    recordSimulationTiming("getAeroPrice", startedAt);
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
      recordSimulationTiming("getAeroPrice.fallback", startedAt);
      return nearest.price;
    }
    recordSimulationTiming("getAeroPrice.error", startedAt);
    throw error;
  }
}

async function findSwapExit(fromBlock, toBlock, tickLower, tickUpper, after = null) {
  const startedAt = performance.now();
  try {
  if (toBlock < fromBlock) return null;
  const logs = await getSwapLogs(fromBlock, toBlock);
  for (const log of logs) {
    const blockNumber = Number(BigInt(log.blockNumber));
    const logIndex = Number(BigInt(log.logIndex));
    if (after && blockNumber === after.blockNumber && logIndex <= after.logIndex) continue;
    if (after && blockNumber < after.blockNumber) continue;
    const tick = Number(toSignedWord(wordAt(log.data, 4)));
    if (tick < tickLower || tick >= tickUpper) {
      return {
        blockNumber,
        logIndex,
        tick,
        sqrtPriceX96: hexToBigInt(`0x${wordAt(log.data, 2)}`),
      };
    }
  }
  return null;
  } finally {
    recordSimulationTiming("findSwapExit", startedAt);
  }
}

async function getSwapLogs(fromBlock, toBlock) {
  const startedAt = performance.now();
  try {
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
  } finally {
    recordSimulationTiming("getSwapLogs", startedAt);
  }
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
  const startedAt = performance.now();
  try {
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
  } finally {
    recordSimulationTiming("estimateLpFees", startedAt);
  }
}

async function quoteAerodromeSwap(tokenIn, tokenOut, amountInRaw, blockNumber) {
  const startedAt = performance.now();
  try {
  if (amountInRaw <= 0n) return { amountOutRaw: 0n, source: "no-swap", reliability: 100, sourceLabel: "exact-onchain" };
  const validPair = new Set([tokenIn.toLowerCase(), tokenOut.toLowerCase()]);
  if (!validPair.has(WETH_ADDRESS.toLowerCase()) || !validPair.has(USDC_ADDRESS.toLowerCase())) {
    throw new Error("token order/pair validation failed");
  }
  const data = `${SELECTORS.quoteExactInputSingle}${encodeAddress(tokenIn)}${encodeAddress(tokenOut)}${encodeUint256(amountInRaw)}${encodeUint256(AERODROME_TICK_SPACING)}${encodeUint256(0)}`;
  let failureReason = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await rpcCall("eth_call", [{ to: AERO_SLIPSTREAM_QUOTER, data }, blockTag(blockNumber)]);
      return { amountOutRaw: hexToBigInt(`0x${wordAt(result, 0)}`), source: "aerodrome-quoter", reliability: 94, sourceLabel: "reconstructed-onchain", attempts: attempt };
    } catch (error) {
      failureReason = error.message || "quoter eth_call failed";
    }
  }
  const context = [
    `reason=${failureReason || "quoter eth_call failed"}`,
    `block=${blockNumber}`,
    `tokenIn=${tokenIn}`,
    `tokenOut=${tokenOut}`,
    `amountInRaw=${amountInRaw.toString()}`,
    `tickSpacing=${AERODROME_TICK_SPACING}`,
    `quoter=${AERO_SLIPSTREAM_QUOTER}`,
    `selector=${SELECTORS.quoteExactInputSingle}`,
    `calldata=${data}`,
  ].join(" ");
  throw new Error(`historical swap quote failed after 2 attempts: ${context}`);
  } finally {
    recordSimulationTiming("quoteAerodromeSwap", startedAt);
  }
}

async function estimateHistoricalSwap(swap, price, blockNumber) {
  const startedAt = performance.now();
  try {
  if (swap.amount <= 0) {
    return { outputAmount: 0, lossUsdc: 0, source: "no-swap", sourceLabel: "exact-onchain", reliability: 100 };
  }
  if (swap.direction === "WETH_TO_USDC") {
    const amountInRaw = rawWeth(swap.amount);
    const quote = await quoteAerodromeSwap(WETH_ADDRESS, USDC_ADDRESS, amountInRaw, blockNumber);
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
  const amountInRaw = rawUsdc(swap.amount);
  const quote = await quoteAerodromeSwap(USDC_ADDRESS, WETH_ADDRESS, amountInRaw, blockNumber);
  const outputAmount = rawToWeth(quote.amountOutRaw);
  return {
    outputAmount,
    lossUsdc: Math.max(0, swap.amount - outputAmount * price),
    source: quote.source,
    sourceLabel: quote.sourceLabel,
    reliability: quote.reliability,
    quoteAttempts: quote.attempts,
  };
  } finally {
    recordSimulationTiming("estimateHistoricalSwap", startedAt);
  }
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
  if (!state.sim.initialRangeReady && !state.sim.rangeStepTicks) return "Range: calculating...";
  const prices = simRangePrices();
  return `Range ${fmtPercent(state.sim.rangeWidth * 100)}%: ${fmtPrice(prices.lower)} - ${fmtPrice(prices.upper)} (ticks ${Math.abs(state.sim.tickLower)} - ${Math.abs(state.sim.tickUpper)})`;
}

function chartSimulationRows() {
  if (serverSimulation.rawRows.length) return serverSimulation.rawRows;
  return state.sim.rows.map(simulationRowToRaw).filter(Boolean);
}

function simulationRowForIndex(index) {
  return chartSimulationRows().find((row) => row?.index === index) || null;
}

function activeChartSimulationRow() {
  if (state.sim.tableHoverIndex >= 0) return simulationRowForIndex(state.sim.tableHoverIndex);
  if (state.sim.activeRowIndex >= 0) return simulationRowForIndex(state.sim.activeRowIndex);
  if (state.sim.currentIndex >= 0) return simulationRowForIndex(state.sim.currentIndex);
  return null;
}

function simulationChartTooltip(row, marketRow) {
  const marketClose = Number(marketRow?.close);
  const executionPrice = Number(row?.price);
  const displayPrice = row?.rebalance && Number.isFinite(marketClose)
    ? marketClose
    : (Number.isFinite(executionPrice) ? executionPrice : marketRow?.close);
  const lines = [
    `${fmtTime(row?.time || marketRow?.time || "")}`,
    `<strong>${fmtPrice(displayPrice)}</strong>`,
  ];
  if (row?.event) lines.push(row.event);
  if (row?.rebalance) {
    const rb = row.rebalance;
    const confirmationBufferBps = Number(rb.confirmationBufferBps);
    if (
      Number.isFinite(marketClose)
      && Number.isFinite(executionPrice)
      && Math.abs(executionPrice - marketClose) / Math.max(1, marketClose) > 0.001
    ) {
      lines.push(`execution ${fmtPrice(executionPrice)}`);
      lines.push(`candle close ${fmtPrice(marketClose)}`);
    }
    lines.push(`range ${rb.oldTickLower}..${rb.oldTickUpper} -> ${rb.newTickLower}..${rb.newTickUpper}`);
    lines.push(`trigger ${fmtPrice(priceForTick(rb.oldTickLower))}..${fmtPrice(priceForTick(rb.oldTickUpper))}`);
    if (Number.isFinite(confirmationBufferBps)) lines.push(`buffer ${fmtNumber(confirmationBufferBps, 2)} bps`);
    if (Number.isFinite(Number(rb.confirmationMinutes))) lines.push(`confirm ${Number(rb.confirmationMinutes)} min`);
    if (rb.swapIsFallback) lines.push(`swap fallback: ${summarizeFallbackReason(rb.quoteFailureReason)}`);
  }
  return lines.join("<br>");
}

function simulationRangeGridPrices(min, max) {
  if ((!state.sim.started && !state.sim.initialRangeReady) || !state.sim.rangeStepTicks) return [];
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
  const minSize = Math.min(1, MIN_CHART_ZOOM_ROWS / rows.length);
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

function drawSimulationRangeBounds(ctx, {
  bounds,
  min,
  max,
  yFor,
  pad,
  width,
  height,
  segmentStartX = pad.left,
  segmentEndX = width - pad.right,
  labelSuffix = "",
}) {
  const activeBounds = bounds
    .filter(({ price }) => Number.isFinite(price) && price >= min && price <= max)
    .map((bound) => ({ ...bound, y: yFor(bound.price) }));
  const activeBoundsAreTight = activeBounds.length === 2 && Math.abs(activeBounds[0].y - activeBounds[1].y) < 34;
  activeBounds.forEach(({ label, price, color, y }) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(segmentStartX, y);
    ctx.lineTo(segmentEndX, y);
    ctx.stroke();
    ctx.setLineDash([]);
    const text = `${label}${labelSuffix} ${fmtPrice(price)}`;
    const textWidth = ctx.measureText(text).width;
    const labelX = Math.max(segmentStartX + 4, segmentEndX - textWidth - 8);
    const preferredLabelY = activeBoundsAreTight && label === "lower" ? y + 16 : y - 6;
    const labelY = Math.max(pad.top + 13, Math.min(height - pad.bottom - 4, preferredLabelY));
    ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
    ctx.fillRect(labelX - 4, labelY - 11, textWidth + 8, 15);
    ctx.fillStyle = "#f25f5c";
    ctx.fillText(text, labelX, labelY);
  });
}

function rangeBoundaryLabelsFromRows(rows = []) {
  const ticksByKey = new Map();
  rows.forEach((row) => {
    [
      ["lower", Number(row?.tickLower)],
      ["upper", Number(row?.tickUpper)],
    ].forEach(([label, tick]) => {
      if (!Number.isFinite(tick)) return;
      const key = `${label}:${tick}`;
      if (ticksByKey.has(key)) return;
      ticksByKey.set(key, {
        label,
        tick,
        price: priceForTick(tick),
      });
    });
  });
  return Array.from(ticksByKey.values())
    .filter(({ price }) => Number.isFinite(price))
    .sort((a, b) => a.price - b.price || a.tick - b.tick || a.label.localeCompare(b.label));
}

function hideEveryOtherOverlappingLabels(labels, minGap = 15) {
  let visible = labels.slice();
  const overlaps = (items) => items.some((item, index) => index > 0 && Math.abs(item.y - items[index - 1].y) < minGap);
  while (visible.length > 2 && overlaps(visible)) {
    visible = visible.filter((_, index) => index % 2 === 0);
  }
  return new Set(visible.map((label) => label.key));
}

function drawRangeBoundaryAxis(ctx, { boundaries, min, max, yFor, pad, width, height }) {
  const active = boundaries
    .filter(({ price }) => Number.isFinite(price) && price >= min && price <= max)
    .map((boundary) => ({
      ...boundary,
      key: `${boundary.label}:${boundary.tick}`,
      y: yFor(boundary.price),
    }));
  if (!active.length) return;
  const visibleLabelKeys = hideEveryOtherOverlappingLabels(active.map((boundary) => ({ ...boundary })).sort((a, b) => a.y - b.y));
  active.forEach((boundary) => {
    const isUpper = boundary.label === "upper";
    ctx.strokeStyle = isUpper ? "rgba(242, 95, 92, 0.5)" : "rgba(15, 139, 141, 0.42)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width - pad.right - 8, boundary.y);
    ctx.lineTo(width - pad.right, boundary.y);
    ctx.stroke();

    if (!visibleLabelKeys.has(boundary.key)) return;
    const text = fmtPrice(boundary.price);
    const labelY = Math.max(pad.top + 5, Math.min(height - pad.bottom - 4, boundary.y + 4));
    ctx.fillStyle = isUpper ? "#f25f5c" : "#0f8b8d";
    ctx.fillText(text, width - pad.right + 12, labelY);
  });
}

function resultRangeSegmentsFromRows(rows = []) {
  const segments = [];
  let current = null;
  rows.forEach((row) => {
    const tickLower = Number(row?.tickLower);
    const tickUpper = Number(row?.tickUpper);
    if (!Number.isFinite(row?.timestamp) || !Number.isFinite(tickLower) || !Number.isFinite(tickUpper)) return;
    if (!current) {
      current = { start: row.timestamp, end: row.timestamp, tickLower, tickUpper };
      return;
    }
    if (tickLower !== current.tickLower || tickUpper !== current.tickUpper) {
      current.end = row.timestamp;
      segments.push(current);
      current = { start: row.timestamp, end: row.timestamp, tickLower, tickUpper };
      return;
    }
    current.end = row.timestamp;
  });
  if (current) segments.push(current);
  return segments;
}

function drawResultRangeSegments(ctx, { segments, min, max, xForTime, yFor, pad, width, height }) {
  if (!segments.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, width - pad.left - pad.right, height - pad.top - pad.bottom);
  ctx.clip();
  segments.forEach((segment) => {
    const x1 = xForTime(segment.start);
    const x2 = xForTime(segment.end);
    if (!Number.isFinite(x1) || !Number.isFinite(x2)) return;
    const startX = Math.max(pad.left, Math.min(x1, x2));
    const endX = Math.min(width - pad.right, Math.max(x1, x2));
    if (endX <= startX) return;
    const lowerPrice = priceForTick(segment.tickLower);
    const upperPrice = priceForTick(segment.tickUpper);
    if (!Number.isFinite(lowerPrice) || !Number.isFinite(upperPrice)) return;
    const topY = Math.max(pad.top, yFor(Math.min(max, upperPrice)));
    const bottomY = Math.min(height - pad.bottom, yFor(Math.max(min, lowerPrice)));
    if (bottomY <= topY) return;
    ctx.fillStyle = "rgba(245, 158, 11, 0.055)";
    ctx.fillRect(startX, topY, endX - startX, bottomY - topY);
  });
  ctx.restore();
}

function minuteTickStep(visibleMinutes, plotWidth) {
  const maxLabels = Math.max(2, Math.floor(plotWidth / 72));
  const targetMinutes = visibleMinutes / maxLabels;
  return [1, 2, 5, 10, 15, 30].find((step) => step >= targetMinutes) || 30;
}

function startOfUtcMinuteStep(timestamp, stepMinutes) {
  const stepMs = stepMinutes * 60 * 1000;
  return Math.ceil(timestamp / stepMs) * stepMs;
}

function drawChartTimeGrid(ctx, { firstTime, lastTime, visibleDays, xForTime, pad, width, height }) {
  const plotWidth = width - pad.left - pad.right;
  const visibleMinutes = (lastTime - firstTime) / (60 * 1000);
  const showMinuteScale = visibleMinutes > 0 && visibleMinutes <= MINUTE_AXIS_MAX_MINUTES;
  const ticks = {
    dayTicks: [],
    weekTicks: [],
    middayTicks: [],
    labeledHourTicks: [],
    allHourTicks: [],
    minuteTicks: [],
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, width - pad.left - pad.right, height - pad.top - pad.bottom);
  ctx.clip();

  if (showMinuteScale) {
    const minuteStep = minuteTickStep(visibleMinutes, plotWidth);
    for (let timestamp = startOfUtcMinuteStep(firstTime, minuteStep); timestamp <= lastTime; timestamp += minuteStep * 60 * 1000) {
      ticks.minuteTicks.push(timestamp);
      const minutes = new Date(timestamp).getUTCMinutes();
      const x = xForTime(timestamp);
      ctx.strokeStyle = minutes === 0 ? "rgba(23, 32, 51, 0.2)" : minutes % 15 === 0 ? "rgba(242, 95, 92, 0.14)" : "rgba(23, 32, 51, 0.07)";
      ctx.lineWidth = minutes === 0 ? 1.1 : minutes % 15 === 0 ? 0.9 : 0.7;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, height - pad.bottom);
      ctx.stroke();
    }
  }

  const firstDay = startOfUtcDay(new Date(firstTime));
  for (let timestamp = firstDay; timestamp <= lastTime; timestamp = addUtcDays(timestamp, 1)) {
    const date = new Date(timestamp);
    const isMonth = date.getUTCDate() === 1;
    const isWeek = date.getUTCDay() === 1;
    if (timestamp >= firstTime) {
      ticks.dayTicks.push(timestamp);
      if (isWeek) ticks.weekTicks.push(timestamp);
      const x = xForTime(timestamp);
      ctx.strokeStyle = isMonth ? "rgba(23, 32, 51, 0.24)" : isWeek ? "rgba(23, 32, 51, 0.16)" : "rgba(23, 32, 51, 0.1)";
      ctx.lineWidth = visibleDays < 7 ? (isMonth ? 2.2 : isWeek ? 1.8 : 1.55) : (isMonth ? 1.5 : isWeek ? 1.1 : 0.75);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, height - pad.bottom);
      ctx.stroke();
    }

    if (!showMinuteScale && visibleDays < 1 && timestamp >= firstTime && timestamp <= lastTime) {
      ticks.allHourTicks.push(timestamp);
    }

    const midday = addUtcHours(timestamp, 12);
    if (visibleDays >= 3 && visibleDays < 7 && midday >= firstTime && midday <= lastTime) {
      ticks.middayTicks.push(midday);
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
      if (!showMinuteScale && visibleDays < 3 && hourTick >= firstTime && hourTick <= lastTime) {
        if (!showMinuteScale && visibleDays < 1) ticks.allHourTicks.push(hourTick);
        if (hour === 6 || hour === 12 || hour === 18) ticks.labeledHourTicks.push(hourTick);
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
  return ticks;
}

function drawChartTimeAxisLabels(ctx, { ticks, visibleDays, xForTime, height }) {
  ctx.fillStyle = "#647087";
  ctx.font = visibleDays < 7 ? "600 12px Inter, system-ui, sans-serif" : "12px Inter, system-ui, sans-serif";
  const xLabelTicks = visibleDays < 1 ? [] : visibleDays <= 14 ? ticks.dayTicks : ticks.weekTicks;
  xLabelTicks.forEach((timestamp) => {
    ctx.fillText(fmtAxisTime(timestamp), xForTime(timestamp), height - 14);
  });
  ctx.font = "12px Inter, system-ui, sans-serif";
  if (visibleDays >= 3 && visibleDays < 7) {
    ticks.middayTicks.forEach((timestamp) => {
      ctx.fillText(fmtAxisHour(timestamp), xForTime(timestamp), height - 14);
    });
  }
  if (visibleDays <= MINUTE_AXIS_MAX_MINUTES / (24 * 60)) {
    ticks.minuteTicks.forEach((timestamp) => {
      const minutes = new Date(timestamp).getUTCMinutes();
      ctx.font = minutes === 0 || minutes === 30 ? "600 12px Inter, system-ui, sans-serif" : "12px Inter, system-ui, sans-serif";
      ctx.fillText(fmtAxisMinute(timestamp), xForTime(timestamp), height - 14);
    });
  } else if (visibleDays < 1) {
    ticks.allHourTicks.forEach((timestamp) => {
      const hour = new Date(timestamp).getUTCHours();
      ctx.font = hour === 6 || hour === 12 || hour === 18 ? "600 12px Inter, system-ui, sans-serif" : "12px Inter, system-ui, sans-serif";
      ctx.fillText(fmtAxisHour(timestamp), xForTime(timestamp), height - 14);
    });
  } else if (visibleDays < 3) {
    ticks.labeledHourTicks.forEach((timestamp) => {
      ctx.fillText(fmtAxisHour(timestamp), xForTime(timestamp), height - 14);
    });
  }
  ctx.font = "12px Inter, system-ui, sans-serif";
}

function draw() {
  resizeCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const pad = { top: 22, right: 72, bottom: 38, left: 72 };
  ctx.clearRect(0, 0, width, height);
  const showChartSkeleton = state.sim.skeletonVisible && !state.sim.initialRangeReady && !state.sim.rows.length;

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
  if (showChartSkeleton) {
    ctx.save();
    ctx.fillStyle = "rgba(248, 250, 252, 0.74)";
    ctx.fillRect(pad.left, pad.top, plotW, plotH);
    ctx.strokeStyle = "rgba(15, 139, 141, 0.16)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i += 1) {
      const y = pad.top + ((i + 1) / 6) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#647087";
    ctx.font = "13px Inter, system-ui, sans-serif";
    ctx.fillText("Range: calculating...", pad.left + 12, pad.top + 24);
    ctx.restore();
  }
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

  const timeTicks = drawChartTimeGrid(ctx, { firstTime, lastTime, visibleDays, xForTime, pad, width, height });

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
  if (state.sim.started || state.sim.initialRangeReady || chartSimulationRows().length) {
    const activeSimRow = activeChartSimulationRow();
    if (activeSimRow?.rebalance) {
      const timestamp = activeSimRow.timestamp ? activeSimRow.timestamp * 1000 : new Date(activeSimRow.time || state.rows[activeSimRow.index]?.time || "").getTime();
      const markerX = Number.isFinite(timestamp) ? xForTime(timestamp) : null;
      const rb = activeSimRow.rebalance;
      if (Number.isFinite(markerX) && markerX >= pad.left && markerX <= width - pad.right) {
        drawSimulationRangeBounds(ctx, { bounds: [
          { label: "lower", price: priceForTick(rb.oldTickLower), color: "rgba(242, 95, 92, 0.72)" },
          { label: "upper", price: priceForTick(rb.oldTickUpper), color: "rgba(242, 95, 92, 0.72)" },
        ], min, max, yFor, pad, width, height, segmentStartX: pad.left, segmentEndX: markerX, labelSuffix: " old" });
        drawSimulationRangeBounds(ctx, { bounds: [
          { label: "lower", price: priceForTick(rb.newTickLower), color: "rgba(242, 95, 92, 0.9)" },
          { label: "upper", price: priceForTick(rb.newTickUpper), color: "rgba(242, 95, 92, 0.9)" },
        ], min, max, yFor, pad, width, height, segmentStartX: markerX, segmentEndX: width - pad.right, labelSuffix: " new" });
      }
    } else {
      const tickLower = Number.isFinite(activeSimRow?.tickLower) ? activeSimRow.tickLower : state.sim.tickLower;
      const tickUpper = Number.isFinite(activeSimRow?.tickUpper) ? activeSimRow.tickUpper : state.sim.tickUpper;
      drawSimulationRangeBounds(ctx, { bounds: [
        { label: "lower", price: priceForTick(tickLower), color: "rgba(242, 95, 92, 0.9)" },
        { label: "upper", price: priceForTick(tickUpper), color: "rgba(242, 95, 92, 0.9)" },
      ], min, max, yFor, pad, width, height });
    }
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

  drawChartTimeAxisLabels(ctx, { ticks: timeTicks, visibleDays, xForTime, height });

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

  const drawRebalanceMarkers = () => {
    const rebalanceRows = chartSimulationRows().filter((row) => row?.rebalance);
    if (!rebalanceRows.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();
    rebalanceRows.forEach((simRow) => {
      const timestamp = simRow.timestamp ? simRow.timestamp * 1000 : new Date(simRow.time || state.rows[simRow.index]?.time || "").getTime();
      if (!Number.isFinite(timestamp) || timestamp < firstTime || timestamp > lastTime) return;
      const marketClose = Number(state.rows[simRow.index]?.close);
      const price = Number.isFinite(marketClose) ? marketClose : Number(simRow.price);
      if (!Number.isFinite(price)) return;
      const x = xForTime(timestamp);
      const y = yFor(price);
      ctx.strokeStyle = "rgba(245, 158, 11, 0.72)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, height - pad.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = simRow.rebalance?.swapIsFallback ? "#f59e0b" : "#16a34a";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    ctx.restore();
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
      const simRow = simulationRowForIndex(rowIndex);
      element.hidden = false;
      element.innerHTML = simRow ? simulationChartTooltip(simRow, row) : `${fmtTime(row.time)}<br><strong>${fmtPrice(row.close)}</strong>`;
      placeTooltip(element, x, y);
    }
    return true;
  };

  drawRebalanceMarkers();

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
  if (!quality || !quality.rowCount) return "CSV loaded";
  return `CSV loaded, ${quality.rowCount.toLocaleString("en-US")} rows, ${(quality.missingMinutes || 0).toLocaleString("en-US")} min missing`;
}

function dataQualityTitle(quality) {
  if (!quality || !quality.rowCount) return "";
  const details = [];
  if (quality.source) details.push(`Source: ${quality.source}.`);
  if (quality.firstTime && quality.lastTime) details.push(`Period: ${fmtInputTime(quality.firstTime)} - ${fmtInputTime(quality.lastTime)} UTC.`);
  if (quality.minuteRowCount) details.push(`Minute grid: ${quality.minuteRowCount.toLocaleString("en-US")} rows.`);
  if (quality.gapCount) {
    details.push(
      `Found ${quality.gapCount.toLocaleString("en-US")} CSV gap(s).`,
      `Total missing: ${quality.missingMinutes.toLocaleString("en-US")} minute(s).`,
      `Largest gap: ${quality.maxGapMinutes} min.`,
      "The simulation runs on the full minute grid; missing candles are flagged for quality and calculated from on-chain state.",
    );
  }
  if (quality.duplicateTimestampCount) details.push(`Duplicate timestamps: ${quality.duplicateTimestampCount.toLocaleString("en-US")}.`);
  if (quality.outOfOrderCount) details.push(`Out-of-order rows: ${quality.outOfOrderCount.toLocaleString("en-US")}.`);
  if (quality.invalidPriceCount) details.push(`Invalid price fields: ${quality.invalidPriceCount.toLocaleString("en-US")}.`);
  if (quality.zeroPriceCount) details.push(`Zero or negative price fields: ${quality.zeroPriceCount.toLocaleString("en-US")}.`);
  if (quality.emptyVolumeCount) details.push(`Empty or invalid volume: ${quality.emptyVolumeCount.toLocaleString("en-US")}.`);
  return details.length ? details.join(" ") : "Minute grid has no detected issues.";
}

function formatDuration(ms) {
  if (ms <= 0) return "0s";
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) return restSeconds ? `${minutes}m ${restSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
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
  if (samples.length < 3) return "Calculating ETA...";
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
  return `${done} / ${total} candles (${doneMinutes} / ${totalMinutes} min) - ${simulationEstimateText()}`;
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
    timeZone: "UTC",
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

function serverProcessingLabel(simulation) {
  const progress = simulation?.progress || {};
  const result = simulation?.result || {};
  const latest = result.latestRawRow || progress.latestRawRow || serverSimulation.rawRows.at(-1) || null;
  const timestamp = formatProgressTimestamp(latest?.time || latest?.timestamp || "");
  const event = String(latest?.event || "").trim();
  return [timestamp, event].filter(Boolean).join(" - ");
}

function serverEtaText(simulation, elapsedSeconds, rowsDone, totalRows) {
  if (!serverSimulation.running || rowsDone <= 0 || totalRows <= rowsDone || elapsedSeconds <= 0) return "-";
  const remainingSeconds = (elapsedSeconds / rowsDone) * (totalRows - rowsDone);
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return "-";
  return formatCompactDurationSeconds(remainingSeconds, { approximate: true });
}

function setServerSimulationProgressNotice({ status, elapsed, processing, rows, eta }) {
  // Do not overwrite critical transport or auth errors with normal progress
  if (simNotice.classList.contains("simNoticeError") && simNotice.textContent.includes("SSE")) {
    return;
  }
  simNotice.replaceChildren();
  simNotice.classList.add("simProgressNotice");
  const columns = [
    ["Status", status || "unknown"],
    ["Elapsed", elapsed || "-"],
    ["Processing", processing || "-"],
    ["Rows", rows || "-"],
    ["ETA", eta || "-"],
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

function localElapsedSeconds(startedAtMs) {
  return startedAtMs ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : 0;
}

function stopSimulationElapsedTimer() {
  if (state.sim.elapsedTimer) clearInterval(state.sim.elapsedTimer);
  state.sim.elapsedTimer = null;
}

function startSimulationElapsedTimer(startedAtMs = Date.now()) {
  state.sim.elapsedStartedAtMs = startedAtMs;
  stopSimulationElapsedTimer();
  state.sim.elapsedTimer = setInterval(() => {
    if (SERVER_SIMULATION_MODE && serverSimulation.running && serverSimulation.lastSimulation) {
      renderServerSimulation(serverSimulation.lastSimulation, { fromTimer: true });
      return;
    }
    if (state.sim.initializing && !SERVER_SIMULATION_MODE) {
      renderStartupNotice();
    }
  }, 1000);
}

function setSimulationStartupStage(stage) {
  state.sim.startupStage = stage || "";
  renderStartupNotice();
}

function renderStartupNotice(extra = "") {
  const stage = state.sim.startupStage || "Initializing simulation...";
  const elapsed = formatStopwatch(localElapsedSeconds(state.sim.elapsedStartedAtMs));
  setSimulationNotice({
    status: stage,
    details: simRangeText(),
    estimate: [extra, `Elapsed ${elapsed}`].filter(Boolean).join(" - "),
  });
}

function setSimulationSkeletonVisible(visible) {
  state.sim.skeletonVisible = Boolean(visible);
  document.body?.classList?.toggle("simSkeletonActive", state.sim.skeletonVisible);
  currentPositionValue.classList.toggle("skeletonText", state.sim.skeletonVisible);
  currentRewardValue.classList.toggle("skeletonText", state.sim.skeletonVisible);
  if (state.sim.skeletonVisible) {
    currentPositionValue.textContent = "Calculating";
    currentRewardValue.textContent = "Calculating";
    renderSimulationTable();
  } else {
    simTableBody.querySelectorAll(".skeletonRow").forEach((row) => row.remove?.());
    simTableWrap.hidden = state.sim.rows.length === 0 && !serverSimulation.rawRows.length;
  }
  draw();
}

function renderSimulationTableSkeleton() {
  const columns = 9;
  simTableBody.innerHTML = Array.from({ length: 4 }, (_, rowIndex) => `
    <tr class="skeletonRow" data-index="skeleton-${rowIndex}">
      ${Array.from({ length: columns }, () => "<td><span class=\"skeletonLine\"></span></td>").join("")}
    </tr>
  `).join("");
  simTableWrap.hidden = false;
}

function applyInitialRange(range) {
  if (!range || !Number.isFinite(Number(range.tickLower)) || !Number.isFinite(Number(range.tickUpper))) return false;
  state.sim.tickLower = Number(range.tickLower);
  state.sim.tickUpper = Number(range.tickUpper);
  state.sim.anchorTick = Number(range.anchorTick || range.tickLower);
  state.sim.startGridTick = Number(range.startGridTick || range.tickLower);
  state.sim.rangeStepTicks = Math.max(
    AERODROME_TICK_SPACING,
    Number(range.rangeStepTicks || Math.round(Math.abs(state.sim.tickUpper - state.sim.tickLower) / AERODROME_TICK_SPACING) * AERODROME_TICK_SPACING),
  );
  if (Number.isFinite(Number(range.rangeWidth))) state.sim.rangeWidth = Number(range.rangeWidth);
  state.sim.initialRangeReady = true;
  setSimulationChartPriceBounds(state.sim.startIndex, state.sim.endIndex);
  if (!hasSimulationInitialChartView()) captureSimulationInitialChartView();
  draw();
  return true;
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
    setSimulationNotice("Simulation end selected from the chart.");
  } else {
    setSimulationStart(index);
    setSimulationNotice("Simulation start selected from the chart.");
  }
}

function nudgeTimeInput(inputName, deltaMinutes) {
  const input = inputName === "end" ? simEndInput : simStartInput;
  const timestamp = parseInputTime(input.value);
  if (Number.isNaN(timestamp)) {
    setSimulationNotice(`Cannot parse ${inputName === "end" ? "end date" : "start date"}. Use format 2026-02-01 00:00.`);
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
  updateResetChartViewButton();
  if (simulationModeSelect) simulationModeSelect.value = state.sim.lpMode;
  if (SERVER_SIMULATION_MODE) {
    if (serverSimulation.running && !serverSimulation.paused) {
      runSimulation.textContent = "PAUSE";
      runSimulation.title = "Pause server simulation";
      runSimulation.disabled = false;
    } else {
      runSimulation.textContent = serverSimulation.paused ? "RESUME" : "START";
      runSimulation.title = serverSimulation.paused ? "Resume server simulation" : "Start server simulation";
      runSimulation.disabled = false;
    }
    if (resetSimulationButton) {
      const hasActiveServerSimulation = Boolean(serverSimulation.id && (serverSimulation.running || serverSimulation.paused));
      resetSimulationButton.textContent = hasActiveServerSimulation ? "STOP" : "RESET";
      resetSimulationButton.title = hasActiveServerSimulation ? "Stop server simulation" : "Reset simulation";
      resetSimulationButton.disabled = false;
    }
    if (stepBack) stepBack.disabled = true;
    if (stepForward) stepForward.disabled = true;
    return;
  }
  if (state.sim.initializing || state.sim.autoRunning) {
    runSimulation.textContent = "PAUSE";
    runSimulation.title = "Pause simulation";
  } else if (!state.sim.started) {
    runSimulation.textContent = "START";
    runSimulation.title = "Start simulation";
  } else {
    runSimulation.textContent = "RESUME";
    runSimulation.title = "Resume simulation";
  }
  if (resetSimulationButton) {
    resetSimulationButton.textContent = state.sim.started || state.sim.initializing || state.sim.autoRunning ? "STOP" : "RESET";
    resetSimulationButton.title = state.sim.started || state.sim.initializing || state.sim.autoRunning ? "Stop simulation" : "Reset simulation";
    resetSimulationButton.disabled = state.sim.rows.length === 0 && !state.sim.started && !state.sim.initializing;
  }
  if (stepBack) stepBack.disabled = state.sim.initializing || state.sim.autoRunning || state.sim.rows.length <= 1;
  if (stepForward) stepForward.disabled = state.sim.initializing || state.sim.autoRunning || state.sim.stepInProgress || state.sim.stopped || !state.sim.started || state.sim.currentIndex >= state.sim.endIndex;
}

function resetSimulationRows() {
  stopSimulationElapsedTimer();
  state.sim.initializing = false;
  state.sim.autoRunning = false;
  state.sim.stepInProgress = false;
  state.sim.runToken += 1;
  state.sim.autoLoopId += 1;
  state.sim.stepDurations = [];
  state.sim.etaMs = 0;
  state.sim.rows = [];
  resetSimulationTiming();
  simulationEngine.resetSequentialBlockCursor();
  state.sim.blockCache = new Map();
  state.sim.blockByNumberCache = new Map();
  state.sim.started = false;
  state.sim.stopped = false;
  state.sim.rewardStart = 0n;
  state.sim.startGridTick = 0;
  state.sim.rangeStepTicks = 0;
  state.sim.lastExitBlockNumber = 0;
  state.sim.lastExitLogIndex = -1;
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
  state.sim.startupStage = "";
  state.sim.elapsedStartedAtMs = 0;
  state.sim.initialRangeReady = false;
  state.sim.skeletonVisible = false;
  state.sim.chartPriceMin = null;
  state.sim.chartPriceMax = null;
  state.sim.initialChartView = null;
  state.sim.userAdjustedChartView = false;
  updateResetChartViewButton();
  document.body?.classList?.toggle("simSkeletonActive", false);
  simTableBody.innerHTML = "";
  simTableWrap.hidden = true;
  currentPositionValue.textContent = "$0.00";
  currentRewardValue.textContent = "$0.00";
  currentTotalValue.textContent = "$0.00";
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
  const quoteFailure = rb.swapIsFallback && rb.quoteFailureReason ? `; fallback reason: ${summarizeFallbackReason(rb.quoteFailureReason)}` : "";
  const buffer = Number.isFinite(rb.confirmationBufferBps) ? `; confirm buffer ${fmtNumber(rb.confirmationBufferBps, 2)} bps` : "";
  const confirmMinutes = Number.isFinite(Number(rb.confirmationMinutes)) ? `; confirm ${Number(rb.confirmationMinutes)} min` : "";
  return `${details}; swap ${rb.swapDirection} via ${rb.swapSource}; swap loss ${fmtUsdc(rb.swapLossUsdc)}; gas ${fmtUsdc(rb.gasUsdc)}; fee ${fmtUsdc(rb.automationFeeUsdc)}; ticks ${rb.oldTickLower}..${rb.oldTickUpper} -> ${rb.newTickLower}..${rb.newTickUpper}${buffer}${confirmMinutes}${quoteFailure}`;
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
      confirmationBufferBps: compactNumber(row.rebalance.confirmationBufferBps ?? REBALANCE_CONFIRMATION_BUFFER_BPS, 4),
      confirmationMinutes: row.rebalance.confirmationMinutes ?? REBALANCE_CONFIRMATION_MINUTES,
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

function getSimulationRawRowsFrom(startIndex = 0) {
  return state.sim.rows.slice(Math.max(0, startIndex)).map(simulationRowToRaw).filter(Boolean);
}

function getSimulationDisplayRows() {
  return getSimulationRawRows().map((row) => simulationRawRowToCells(row).join("\t"));
}

function getSimulationDisplayState() {
  const last = state.sim.rows.at(-1);
  const raw = last ? simulationRowToRaw(last) : null;
  const isStaked = state.sim.lpMode === "staked";
  const rewardValue = last ? (isStaked ? last.aeroTotalUsdc ?? last.aeroUsdc : last.lpFeesTotalUsdc ?? 0) : 0;
  const totalReturnValue = last ? last.totalReturnUsdc ?? rewardValue : 0;
  return {
    rowCount: state.sim.rows.length,
    lastRow: raw ? simulationRawRowToCells(raw).join("\t") : "",
    currentValue: last ? fmtUsdc(last.value) : currentPositionValue.textContent || "",
    currentReward: last ? fmtUsdc(rewardValue) : currentRewardValue.textContent || "",
    currentTotalReturn: last ? fmtUsdc(totalReturnValue) : currentTotalValue.textContent || "",
  };
}

function getSimulationRawRowCount() {
  return state.sim.rows.length;
}

function getSimulationDataQuality() {
  return state.dataQuality || null;
}

function getSimulationStartupState() {
  return {
    stage: state.sim.startupStage || "",
    elapsedSeconds: localElapsedSeconds(state.sim.elapsedStartedAtMs),
    skeletonVisible: Boolean(state.sim.skeletonVisible),
    initialRange: state.sim.initialRangeReady ? {
      tickLower: state.sim.tickLower,
      tickUpper: state.sim.tickUpper,
      anchorTick: state.sim.anchorTick,
      startGridTick: state.sim.startGridTick,
      rangeStepTicks: state.sim.rangeStepTicks,
      rangeWidth: state.sim.rangeWidth,
    } : null,
  };
}

function simulationRawRowToCells(row) {
  if (!row || typeof row !== "object") return [];
  const eventParts = [row.missingCandle ? `${row.event} - missing candle` : row.event];
  if (row.rebalance?.swapIsFallback) eventParts.push("swap fallback");
  return [
    row.time ? fmtInputTime(row.time) : "",
    eventParts.filter(Boolean).join(" - "),
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
  const startedAt = performance.now();
  try {
  if (IS_SERVER_WORKER) {
    const last = state.sim.rows[state.sim.rows.length - 1];
    simTableWrap.hidden = state.sim.rows.length === 0;
    if (last) {
      setSimulationSkeletonVisible(false);
      currentPositionValue.textContent = fmtUsdc(last.value);
      const isStaked = state.sim.lpMode === "staked";
      const rewardValue = isStaked ? last.aeroTotalUsdc ?? last.aeroUsdc : last.lpFeesTotalUsdc ?? 0;
      const totalReturnValue = last.totalReturnUsdc ?? rewardValue;
      currentRewardLabel.textContent = isStaked ? "AERO, $" : "LP fees, $";
      currentRewardValue.textContent = fmtUsdc(rewardValue);
      currentTotalValue.textContent = fmtUsdc(totalReturnValue);
    }
    updateSimulationControls();
    return;
  }
  if (!state.sim.rows.length && state.sim.skeletonVisible) {
    renderSimulationTableSkeleton();
    updateSimulationControls();
    draw();
    return;
  }
  simTableBody.innerHTML = state.sim.rows.map((row) => `
    <tr data-index="${row.index}" class="${row.index === state.sim.activeRowIndex ? "activeRow" : ""}" title="${simulationRowTitle(row)}">
      <td>${fmtInputTime(state.rows[row.index]?.time || "")}</td>
      <td>${[row.event, row.rebalance?.swapIsFallback ? "swap fallback" : ""].filter(Boolean).join(" - ")}</td>
      <td>${fmtUsdc(row.value)}</td>
      <td>${fmtPrice(row.price)}</td>
      <td>${fmtNumber(row.weth, 8)}</td>
      <td>${fmtNumber(row.usdc, 2)}</td>
      <td style="display: ${state.sim.lpMode === "staked" ? "" : "none"}">${fmtUsdc(row.aeroUsdc)}</td>
      <td style="display: ${state.sim.lpMode === "unstaked" ? "" : "none"}">${fmtUsdc(row.lpFeesUsdcValue || 0)}</td>
      <td>${fmtReliability(row.reliability)}</td>
    </tr>
  `).join("");
  const aeroTh = document.getElementById("aeroTh");
  const lpFeesTh = document.getElementById("lpFeesTh");
  if (aeroTh) aeroTh.style.display = state.sim.lpMode === "staked" ? "" : "none";
  if (lpFeesTh) lpFeesTh.style.display = state.sim.lpMode === "unstaked" ? "" : "none";
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
    setSimulationSkeletonVisible(false);
    currentPositionValue.textContent = fmtUsdc(last.value);
    const isStaked = state.sim.lpMode === "staked";
    const rewardValue = isStaked ? last.aeroTotalUsdc ?? last.aeroUsdc : last.lpFeesTotalUsdc ?? 0;
    const totalReturnValue = last.totalReturnUsdc ?? rewardValue;
    const rewardLabel = isStaked ? "AERO, $" : "LP fees, $";
    currentRewardLabel.textContent = rewardLabel;
    currentRewardValue.textContent = fmtUsdc(rewardValue);
    currentTotalValue.textContent = fmtUsdc(totalReturnValue);
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
  } finally {
    recordSimulationTiming("renderSimulationTable", startedAt);
  }
}

function setSimulationNotice(message, isError = false) {
  if (simNotice.classList?.remove) {
    simNotice.classList.remove("simProgressNotice", "simNoticeError", "simNoticeWarning");
  }
  let notice = typeof message === "string" ? { status: message, details: "", isError } : { ...message };

  if (typeof message === "string" && !isError) {
    if (message.includes("error") || message.includes("Failed") || message.includes("Cannot") || message.includes("stopped") || message.includes("unavailable") || message.includes("must be")) {
      notice.isError = true;
    }
  }

  // Detect plan limits and upgrade to warning if it's a known RPC restriction
  if (isPlanLimitError(notice.status) || isPlanLimitError(notice.details)) {
    notice.isWarning = true;
    notice.status = "RPC plan limit (Chainstack)";
    notice.details = "The current plan does not support Archive/Debug requests. The app will try cached data or simplified models, but accuracy may suffer or the simulation may stop.";
  }

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

  // Add "Update Token" button if it's an auth error
  if (notice.isError && (String(notice.status).includes("SSE") || String(notice.details).includes("token") || String(notice.details).includes("authoriz"))) {
    const btn = document.createElement("button");
    btn.textContent = "Update token";
    btn.style.cssText = "margin-top:8px;padding:4px 12px;font-size:12px;border:1px solid #ccc;border-radius:4px;background:white;cursor:pointer;";
    btn.onclick = async () => {
      const token = await showTokenPrompt();
      if (token && typeof localStorage !== "undefined") {
        localStorage.setItem("walletWatchAdminToken", token);
        if (serverSimulation.id) {
          stopServerSimulationEvents();
          watchServerSimulation(serverSimulation.id);
        }
      }
    };
    estimateEl.append(document.createElement("br"), btn);
  }

  if (notice.isError) {
    simNotice.classList.add("simNoticeError");
  } else if (notice.isWarning) {
    simNotice.classList.add("simNoticeWarning");
  }
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
  REBALANCE_CONFIRMATION_BUFFER_BPS,
  REBALANCE_CONFIRMATION_MINUTES,
  AERO_IMPACT_HAIRCUT_MAX,
  Q128,
  AERO_DECIMALS,
  recordSimulationStepDuration,
  recordSimulationTiming,
  simulationProgressText,
  setSimulationNotice,
  renderSimulationTable,
  updateSimulationControls,
  isServerWorker: IS_SERVER_WORKER,
  secondsPerBlock: BASE_SECONDS_PER_BLOCK,
});

function showTokenPrompt() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';
    const content = document.createElement('div');
    content.style.cssText = 'background:white;padding:20px;border-radius:5px;max-width:400px;width:90%;';
    content.innerHTML = `
      <p style="margin:0 0 10px 0;">Enter ADMIN_API_TOKEN for the server operation:</p>
      <input type="password" id="tokenInput" style="width:100%;padding:8px;margin:0 0 10px 0;border:1px solid #ccc;border-radius:3px;">
      <div style="text-align:right;">
        <button id="cancelBtn" style="margin-right:10px;padding:8px 16px;border:1px solid #ccc;border-radius:3px;background:#f5f5f5;">Cancel</button>
        <button id="okBtn" style="padding:8px 16px;border:1px solid #007bff;border-radius:3px;background:#007bff;color:white;">OK</button>
      </div>
    `;
    modal.appendChild(content);
    document.body.appendChild(modal);
    const input = content.querySelector('#tokenInput');
    const okBtn = content.querySelector('#okBtn');
    const cancelBtn = content.querySelector('#cancelBtn');
    okBtn.onclick = () => {
      const token = input.value.trim();
      document.body.removeChild(modal);
      resolve(token);
    };
    cancelBtn.onclick = () => {
      document.body.removeChild(modal);
      resolve('');
    };
    input.focus();
    input.onkeydown = (e) => {
      if (e.key === 'Enter') okBtn.click();
      if (e.key === 'Escape') cancelBtn.click();
    };
  });
}

async function fetchJson(url, options = {}) {
  const adminToken = typeof localStorage !== "undefined" ? localStorage.getItem("walletWatchAdminToken") : "";
  const adminHeaders = adminToken ? { "X-Admin-API-Token": adminToken } : {};
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...adminHeaders, ...(options.headers || {}) },
    ...options,
  });
  if (response.status === 401 && typeof localStorage !== "undefined" && typeof document !== "undefined") {
    const token = await showTokenPrompt();
    if (token) {
      localStorage.setItem("walletWatchAdminToken", token);
      return await fetchJson(url, options);
    } else {
      throw new Error("Admin token required. Please enter it in the dialog or set 'walletWatchAdminToken' in localStorage.");
    }
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.error || payload?.message || `HTTP ${response.status}`;
    if (response.status === 401 && detail === "admin token required") {
      throw new Error("Admin token required. Please enter it when prompted or set 'walletWatchAdminToken' in localStorage and retry.");
    }
    const error = new Error(detail);
    error.status = response.status;
    error.code = payload?.code || "";
    error.retryAfterSeconds = payload?.retryAfterSeconds || 0;
    throw error;
  }
  return payload;
}

function fetchJsonWithProgress(url, options = {}, onProgress = null) {
  const adminToken = typeof localStorage !== "undefined" ? localStorage.getItem("walletWatchAdminToken") : "";
  const adminHeaders = adminToken ? { "X-Admin-API-Token": adminToken } : {};
  const method = options.method || "GET";
  const requestStage = options.progressStage || "Requesting simulation...";
  const downloadStage = options.downloadStage || "Downloading result...";
  const parseStage = options.parseStage || "Parsing response...";
  onProgress?.({ stage: requestStage, percent: 5 });

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, url, true);
    const headers = { "Content-Type": "application/json", ...adminHeaders, ...(options.headers || {}) };
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.onprogress = (event) => {
      onProgress?.({
        stage: downloadStage,
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : 0,
        percent: event.lengthComputable && event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0,
      });
    };
    request.onload = async () => {
      let payload = null;
      onProgress?.({ stage: parseStage, loaded: request.responseText.length, total: request.responseText.length, percent: 100 });
      try {
        payload = request.responseText ? JSON.parse(request.responseText) : null;
      } catch (_) {
        payload = null;
      }
      if (request.status === 401 && typeof localStorage !== "undefined" && typeof document !== "undefined") {
        try {
          const token = await showTokenPrompt();
          if (token) {
            localStorage.setItem("walletWatchAdminToken", token);
            resolve(await fetchJsonWithProgress(url, options, onProgress));
          } else {
            reject(new Error("Admin token required. Please enter it in the dialog or set 'walletWatchAdminToken' in localStorage."));
          }
        } catch (error) {
          reject(error);
        }
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        const detail = payload?.error || payload?.message || `HTTP ${request.status}`;
        const error = new Error(detail);
        error.status = request.status;
        error.code = payload?.code || "";
        error.retryAfterSeconds = payload?.retryAfterSeconds || 0;
        reject(error);
        return;
      }
      resolve(payload);
    };
    request.onerror = () => reject(new Error("Network error while loading simulation."));
    request.ontimeout = () => reject(new Error("Timed out while loading simulation."));
    request.send(options.body || null);
  });
}

function isServerSimulationTerminal(status) {
  return ["completed", "failed", "stopped", "timeout", "error", "cancelled"].includes(status);
}

function serverSimulationText(simulation) {
  const progress = simulation?.progress || {};
  const result = simulation?.result || {};
  const payload = Object.keys(result).length ? result : progress;
  const rawRows = payload.rawRows || progress.rawRows || result.rawRows || [];
  const latestRawRow = payload.latestRawRow || rawRows.at?.(-1) || null;
  const rows = payload.rows || payload.rawRowCount || progress.rawRowCount || result.rawRowCount || 0;
  const elapsed = payload.elapsedSeconds ? formatDuration(payload.elapsedSeconds * 1000) : "";
  const notice = (payload.notice || simulation?.error || "").replace(/to the end date/g, "to the end");
  return {
    rows,
    elapsed,
    currentValue: payload.currentValue || "",
    currentReward: payload.currentReward || payload.currentAero || "",
    currentTotalReturn: payload.currentTotalReturn || (latestRawRow ? fmtUsdc(latestRawRow.totalReturnUsdc || 0) : ""),
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
  if (!serverSimulation.startedAtMs && simulation?.created_at) {
    serverSimulation.startedAtMs = simulation.created_at * 1000;
  }
  return localElapsedSeconds(serverSimulation.startedAtMs);
}

function isServerLiveRenderingActive() {
  if (!SERVER_SIMULATION_MODE) return false;
  if (!serverSimulation.id) return true;
  if (!serverSimulation.running) return true;
  return serverSimulation.liveViewOpen;
}

function setServerUiMode(mode) {
  serverSimulation.uiMode = mode === "background" ? "background" : "live";
  serverSimulation.liveViewOpen = serverSimulation.uiMode === "live";
  renderServerObservationMode();
}

function serverProgressSummary(simulation) {
  const info = serverSimulationText(simulation);
  const elapsedSeconds = serverElapsedSeconds(simulation);
  const rowsDone = Number(info.rows || 0);
  const totalRows = estimateServerTotalRows(simulation);
  return {
    status: serverSimulation.paused
      ? "paused"
      : (rowsDone > 0 ? (simulation?.status || "running") : serverInitializationStage(simulation)),
    elapsed: formatCompactDurationSeconds(elapsedSeconds),
    processing: serverProcessingLabel(simulation) || (state.sim.initialRangeReady ? simRangeText() : "Range: calculating..."),
    rows: (state.sim.skeletonVisible && !serverSimulation.rawRows.length)
      ? (totalRows > 0 ? `- / ${totalRows}` : "-")
      : (totalRows > 0 ? `${rowsDone} / ${totalRows}` : (rowsDone > 0 ? `${rowsDone} / -` : "-")),
    eta: serverEtaText(simulation, elapsedSeconds, rowsDone, totalRows),
  };
}

function renderBackgroundProgressPanel(summary) {
  if (!backgroundProgressPanel) return;
  backgroundProgressPanel.replaceChildren();
  const rows = [
    ["Status", summary.status],
    ["Rows", summary.rows],
    ["Elapsed", summary.elapsed],
    ["ETA", summary.eta],
    ["Processing", summary.processing],
  ];
  rows.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "backgroundProgressItem";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    const valueEl = document.createElement("strong");
    valueEl.textContent = value || "-";
    item.append(labelEl, valueEl);
    backgroundProgressPanel.append(item);
  });
}

function renderServerObservationMode(summary = null) {
  const backgroundActive = SERVER_SIMULATION_MODE
    && serverSimulation.id
    && serverSimulation.running
    && !serverSimulation.liveViewOpen;
  if (serverBackgroundOverlay) serverBackgroundOverlay.hidden = !backgroundActive;
  if (backgroundProgressPanel) backgroundProgressPanel.hidden = !backgroundActive;
  if (simNotice) simNotice.hidden = backgroundActive;
  if (closeLiveViewButton) closeLiveViewButton.hidden = !(SERVER_SIMULATION_MODE && serverSimulation.id && serverSimulation.running && serverSimulation.liveViewOpen);
  if (serverBackgroundOverlayText && summary) {
    serverBackgroundOverlayText.textContent = `${summary.status || "running"} - ${summary.rows || "-"} rows - ETA ${summary.eta || "-"}`;
  }
  if (backgroundActive) {
    if (summary) renderBackgroundProgressPanel(summary);
    simTableWrap.hidden = true;
  }
}

function openServerLiveView() {
  if (!SERVER_SIMULATION_MODE || !serverSimulation.id) return;
  serverSimulation.liveViewOpen = true;
  serverSimulation.uiMode = "live";
  if (simNotice) simNotice.hidden = false;
  renderServerObservationMode(serverSimulation.lastSimulation ? serverProgressSummary(serverSimulation.lastSimulation) : null);
  if (serverSimulation.lastSimulation) renderServerSimulation(serverSimulation.lastSimulation);
}

function closeServerLiveView() {
  if (!SERVER_SIMULATION_MODE || !serverSimulation.id || !serverSimulation.running) return;
  serverSimulation.liveViewOpen = false;
  serverSimulation.uiMode = "background";
  renderServerObservationMode(serverSimulation.lastSimulation ? serverProgressSummary(serverSimulation.lastSimulation) : null);
  updateSimulationControls();
}

function applyServerRawProgress(simulation) {
  if (!SERVER_SIMULATION_MODE) return;
  const progress = simulation?.progress || {};
  const resultRows = simulation?.result?.rawRows;
  const progressRows = progress.rawRows;
  if (!serverSimulation.rawRows.length && progress.initialRange) {
    applyInitialRange(progress.initialRange);
  }
  if (!isServerLiveRenderingActive() && !Array.isArray(resultRows)) {
    return;
  }
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
  setSimulationSkeletonVisible(false);
  state.sim.started = true;
  state.sim.initializing = false;
  state.sim.initialRangeReady = true;
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
  const created = simulation?.created_at ? fmtTime(simulation.created_at * 1000) : "";
  return [
    simulation?.status || "unknown",
    info.rows ? `${info.rows} rows` : "",
    info.currentValue || "",
    info.currentReward ? info.currentReward : "",
    created,
  ].filter(Boolean).join(" - ");
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

function createResultMetric(label, value, title = "") {
  const metric = document.createElement("div");
  metric.className = "resultMetric";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const valueWrap = document.createElement("div");
  valueWrap.className = "simTotalValue";
  const valueEl = document.createElement("strong");
  valueEl.textContent = value || "-";
  valueWrap.append(valueEl);
  if (title || value) metric.title = title || value;
  metric.append(labelEl, valueWrap);
  return metric;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function summarizeFallbackReason(reason) {
  const text = String(reason || "").trim();
  const lower = text.toLowerCase();
  if (!text) return "unknown";
  if (lower.includes("free tier") || lower.includes("timeout")) return "RPC timeout/free tier";
  if (lower.includes("historical state") && lower.includes("not available")) return "historical state unavailable";
  if (lower.includes("execution reverted")) return "quoter reverted";
  if (lower.includes("temporary internal error")) return "RPC temporary internal error";
  if (lower.includes("archive") || lower.includes("plan") || lower.includes("limit")) return "RPC archive/plan limit";
  return text.length > 96 ? `${text.slice(0, 93)}...` : text;
}

function swapFallbackSummary(rawRows = []) {
  const rebalanceRows = rawRows.filter((row) => row?.rebalance);
  const fallbackRows = rebalanceRows.filter((row) => row.rebalance?.swapIsFallback);
  if (!rebalanceRows.length) return { label: "0 / 0", reasons: [] };
  const reasonCounts = new Map();
  fallbackRows.forEach((row) => {
    const label = summarizeFallbackReason(row.rebalance?.quoteFailureReason);
    reasonCounts.set(label, (reasonCounts.get(label) || 0) + 1);
  });
  const reasons = Array.from(reasonCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => `${reason} x${count}`);
  return {
    label: `${fallbackRows.length} / ${rebalanceRows.length}`,
    reasons,
    details: reasons.length ? `${fallbackRows.length} / ${rebalanceRows.length} - ${reasons.join("; ")}` : `${fallbackRows.length} / ${rebalanceRows.length}`,
  };
}

function simulationWarnings(rawRows = [], dataQuality = null) {
  const warnings = new Set();
  if (dataQuality?.missingMinutes > 0) warnings.add(`${dataQuality.missingMinutes} missing CSV minute(s) filled`);
  if (rawRows.some((row) => row?.missingCandle)) warnings.add("missing candles present in raw rows");
  const fallback = swapFallbackSummary(rawRows);
  if (fallback.reasons.length) warnings.add(`rebalance swap fallback used: ${fallback.reasons.join("; ")}`);
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
  const rowsToRender = tableRows.length > 1000
    ? [...tableRows.slice(0, 500), null, ...tableRows.slice(-500)]
    : tableRows;
  const hiddenRows = Math.max(0, tableRows.length - 1000);
  const fragment = document.createDocumentFragment();
  for (const rowItem of rowsToRender) {
    if (rowItem === null) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 15;
      td.style.textAlign = "center";
      td.style.padding = "20px";
      td.style.color = "#888";
      td.style.fontStyle = "italic";
      td.textContent = `... ${hiddenRows} rows hidden to improve performance ...`;
      tr.append(td);
      fragment.append(tr);
      continue;
    }
    const tr = document.createElement("tr");
    if (typeof rowItem === "object" && rowItem !== null && rowItem.rebalance?.swapIsFallback) {
      tr.title = `swap fallback: ${summarizeFallbackReason(rowItem.rebalance.quoteFailureReason)}`;
    }
    const cells = typeof rowItem === "object" && rowItem !== null
      ? simulationRawRowToCells(rowItem)
      : String(rowItem).split("\t").map((cellText) => cellText.trim());
    cells.forEach((cellText) => {
      const td = document.createElement("td");
      td.textContent = cellText;
      tr.append(td);
    });
    fragment.append(tr);
  }
  resultTableBody.append(fragment);
  resultEmpty.hidden = true;
  resultTableWrap.hidden = false;
}

function resultLoadingDetails(progress = {}) {
  const loaded = formatBytes(progress.loaded);
  const total = formatBytes(progress.total);
  if (loaded && total) return `${loaded} / ${total}`;
  if (loaded) return `${loaded} loaded`;
  return "Waiting for server response";
}

function clearResultChart() {
  if (!resultChartWrap || !resultPriceChart || !resultChartCtx) return;
  resultChartWrap.hidden = true;
  resultChartCtx.clearRect(0, 0, resultPriceChart.width, resultPriceChart.height);
}

function resultChartRows(rawRows = []) {
  return rawRows.map((rawRow) => {
    const marketRow = state.rows[rawRow?.index] || null;
    const timestamp = rawRow?.timestamp
      ? Number(rawRow.timestamp) * 1000
      : new Date(rawRow?.time || marketRow?.time || "").getTime();
    const close = Number.isFinite(Number(marketRow?.close)) ? Number(marketRow.close) : Number(rawRow?.price);
    if (!Number.isFinite(timestamp) || !Number.isFinite(close)) return null;
    return {
      ...rawRow,
      time: marketRow?.time || rawRow?.time || new Date(timestamp).toISOString(),
      timestamp,
      close,
    };
  }).filter(Boolean);
}

function resizeResultCanvas() {
  if (!resultPriceChart || !resultChartCtx) return;
  const rect = resultPriceChart.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  resultPriceChart.width = Math.round(rect.width * scale);
  resultPriceChart.height = Math.round(rect.height * scale);
  resultChartCtx.setTransform(scale, 0, 0, scale, 0, 0);
}

function resetResultChartView(simulationId = "") {
  state.resultChart.simulationId = simulationId || "";
  state.resultChart.zoomStart = 0;
  state.resultChart.zoomEnd = 1;
  state.resultChart.hoverIndex = -1;
  state.resultChart.isDragging = false;
}

function ensureResultChartView(simulationId = "") {
  if ((simulationId || "") !== state.resultChart.simulationId) resetResultChartView(simulationId);
}

function resultVisibleRows(chartRows) {
  if (chartRows.length <= 1) return chartRows;
  const start = Math.floor(state.resultChart.zoomStart * (chartRows.length - 1));
  const end = Math.ceil(state.resultChart.zoomEnd * (chartRows.length - 1)) + 1;
  return chartRows.slice(start, Math.max(start + 2, end));
}

function resultZoomAt(ratio, direction, rowCount) {
  if (rowCount <= 2) return;
  const currentStart = state.resultChart.zoomStart;
  const currentEnd = state.resultChart.zoomEnd;
  const currentSize = currentEnd - currentStart;
  const factor = direction < 0 ? 0.75 : 1.35;
  const minSize = Math.min(1, MIN_CHART_ZOOM_ROWS / rowCount);
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
  state.resultChart.zoomStart = nextStart;
  state.resultChart.zoomEnd = nextEnd;
}

function resultPanBy(deltaRatio) {
  const currentSize = state.resultChart.zoomEnd - state.resultChart.zoomStart;
  if (currentSize >= 1) return;
  let nextStart = state.resultChart.dragStart + deltaRatio;
  let nextEnd = state.resultChart.dragEnd + deltaRatio;
  if (nextStart < 0) {
    nextStart = 0;
    nextEnd = currentSize;
  }
  if (nextEnd > 1) {
    nextEnd = 1;
    nextStart = 1 - currentSize;
  }
  state.resultChart.zoomStart = nextStart;
  state.resultChart.zoomEnd = nextEnd;
}

function drawResultChart(rawRows = [], simulationId = "") {
  if (!resultChartWrap || !resultPriceChart || !resultChartCtx) return;
  ensureResultChartView(simulationId);
  const chartRows = resultChartRows(rawRows);
  const visibleRows = resultVisibleRows(chartRows);
  if (visibleRows.length < 2) {
    clearResultChart();
    return;
  }
  resultChartWrap.hidden = false;
  resizeResultCanvas();

  const ctx = resultChartCtx;
  const width = resultPriceChart.clientWidth;
  const height = resultPriceChart.clientHeight;
  const pad = { top: 20, right: 72, bottom: 34, left: 72 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);
  ctx.clearRect(0, 0, width, height);

  const renderedRows = downsample(visibleRows, Math.max(2, Math.floor(width * POINTS_PER_PIXEL)));
  let min = Math.min(...visibleRows.map((row) => row.close));
  let max = Math.max(...visibleRows.map((row) => row.close));
  const visibleRangeBoundaries = rangeBoundaryLabelsFromRows(visibleRows);
  visibleRangeBoundaries.forEach(({ price }) => {
    if (!Number.isFinite(price)) return;
    min = Math.min(min, price);
    max = Math.max(max, price);
  });
  if (min === max) {
    min *= 0.995;
    max *= 1.005;
  }
  const padding = (max - min) * 0.08;
  min -= padding;
  max += padding;
  const span = max - min || 1;
  const firstTime = visibleRows[0].timestamp;
  const lastTime = visibleRows[visibleRows.length - 1].timestamp;
  const visibleDays = (lastTime - firstTime) / (24 * 60 * 60 * 1000);
  const xForTime = (timestamp) => pad.left + ((timestamp - firstTime) / Math.max(1, lastTime - firstTime)) * plotW;
  const yFor = (price) => pad.top + (1 - (price - min) / span) * plotH;

  ctx.fillStyle = "rgba(248, 250, 252, 0.74)";
  ctx.fillRect(pad.left, pad.top, plotW, plotH);
  if (!visibleRangeBoundaries.length) {
    ctx.strokeStyle = "rgba(23, 32, 51, 0.1)";
    ctx.lineWidth = 0.8;
    for (let i = 1; i <= 5; i += 1) {
      const y = pad.top + (i / 6) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
    }
  }

  const timeTicks = drawChartTimeGrid(ctx, { firstTime, lastTime, visibleDays, xForTime, pad, width, height });

  ctx.font = "12px Inter, system-ui, sans-serif";
  drawResultRangeSegments(ctx, {
    segments: resultRangeSegmentsFromRows(visibleRows),
    min,
    max,
    xForTime,
    yFor,
    pad,
    width,
    height,
  });
  drawRangeBoundaryAxis(ctx, {
    boundaries: visibleRangeBoundaries,
    min,
    max,
    yFor,
    pad,
    width,
    height,
  });

  const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  gradient.addColorStop(0, "rgba(15, 139, 141, 0.18)");
  gradient.addColorStop(1, "rgba(15, 139, 141, 0)");
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, plotW, plotH);
  ctx.clip();
  ctx.beginPath();
  renderedRows.forEach((row, index) => {
    const x = xForTime(row.timestamp);
    const y = yFor(row.close);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xForTime(renderedRows[renderedRows.length - 1].timestamp), height - pad.bottom);
  ctx.lineTo(xForTime(renderedRows[0].timestamp), height - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.beginPath();
  renderedRows.forEach((row, index) => {
    const x = xForTime(row.timestamp);
    const y = yFor(row.close);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#0f8b8d";
  ctx.lineWidth = 2;
  ctx.stroke();

  rawRows.filter((row) => row?.rebalance).forEach((row) => {
    const timestamp = row.timestamp ? Number(row.timestamp) * 1000 : new Date(row.time || "").getTime();
    if (!Number.isFinite(timestamp) || timestamp < firstTime || timestamp > lastTime) return;
    const marketRow = state.rows[row.index] || null;
    const price = Number.isFinite(Number(marketRow?.close)) ? Number(marketRow.close) : Number(row.price);
    if (!Number.isFinite(price)) return;
    const x = xForTime(timestamp);
    const y = yFor(price);
    ctx.strokeStyle = "rgba(245, 158, 11, 0.72)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = row.rebalance?.swapIsFallback ? "#f59e0b" : "#16a34a";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  ctx.restore();

  if (state.resultChart.hoverIndex >= 0 && visibleRows[state.resultChart.hoverIndex]) {
    const row = visibleRows[state.resultChart.hoverIndex];
    const x = xForTime(row.timestamp);
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
  }

  drawChartTimeAxisLabels(ctx, { ticks: timeTicks, visibleDays, xForTime, height });
}

function drawActiveResultChart() {
  const resultId = appTabs.active?.startsWith("result:") ? appTabs.active.slice("result:".length) : "";
  if (!resultId) return;
  const simulation = appTabs.results.get(resultId);
  if (!simulation || simulation.loading) return;
  const liveRows = simulation?.id === serverSimulation.id ? serverSimulation.rawRows : [];
  drawResultChart(simulation?.result?.rawRows || simulation?.progress?.rawRows || liveRows || [], simulation.id || resultId);
}

function renderSimulationResultLoading(simulation) {
  const progress = simulation?.loadingProgress || {};
  const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
  if (resultSummary) {
    resultSummary.replaceChildren(
      createResultMetric("Status", "Loading"),
      createResultMetric("Progress", progress.total ? `${percent}%` : "Working"),
      createResultMetric("Downloaded", resultLoadingDetails(progress)),
    );
  }
  if (resultLastRow) resultLastRow.textContent = progress.stage || "Loading simulation result...";
  if (resultTableBody) resultTableBody.replaceChildren();
  if (resultTableWrap) resultTableWrap.hidden = true;
  clearResultChart();
  if (!resultEmpty) return;
  const wrap = document.createElement("div");
  wrap.className = "resultLoading";
  const label = document.createElement("div");
  label.className = "resultLoadingLabel";
  const stage = document.createElement("strong");
  stage.textContent = progress.stage || "Loading simulation result...";
  const detail = document.createElement("span");
  detail.textContent = resultLoadingDetails(progress);
  label.append(stage, detail);

  const bar = document.createElement("div");
  bar.className = progress.total ? "resultLoadingBar" : "resultLoadingBar indeterminate";
  const fill = document.createElement("div");
  fill.style.width = progress.total ? `${percent}%` : "35%";
  bar.append(fill);

  const percentEl = document.createElement("div");
  percentEl.className = "resultLoadingPercent";
  percentEl.textContent = progress.total ? `${percent}%` : "Size unknown";
  wrap.append(label, bar, percentEl);
  resultEmpty.replaceChildren(wrap);
  resultEmpty.hidden = false;
}

function renderSimulationResultView(simulation) {
  if (!simulation) {
    if (resultTitle) resultTitle.textContent = "Simulation result";
    if (resultSubtitle) resultSubtitle.textContent = "Simulation is no longer available.";
    if (resultSummary) resultSummary.replaceChildren();
    if (resultLastRow) resultLastRow.textContent = "";
    resetResultChartView();
    clearResultChart();
    renderResultTableRows([]);
    return;
  }
  if (simulation.loading) {
    if (resultTitle) resultTitle.textContent = serverJobLabel(simulation) || simulation.id || "Simulation result";
    if (resultSubtitle) resultSubtitle.textContent = [
      "loading detailed result",
      simulation.id ? `id: ${simulation.id}` : "",
    ].filter(Boolean).join(" - ");
    renderSimulationResultLoading(simulation);
    return;
  }
  const info = serverSimulationText(simulation);
  const params = simulation?.params || {};
  const lpMode = String(params.lpMode || state.sim.lpMode || "staked");
  const isStaked = lpMode === "staked";
  const created = simulation.created_at ? fmtTime(simulation.created_at * 1000) : "";
  const finished = simulation.finished_at ? fmtTime(simulation.finished_at * 1000) : "";
  if (resultTitle) resultTitle.textContent = serverJobLabel(simulation) || simulation.id;
  if (resultSubtitle) {
    resultSubtitle.textContent = [
      `status: ${simulation.status || "unknown"}`,
      created ? `created: ${created}` : "",
      finished ? `finished: ${finished}` : "",
      `id: ${simulation.id}`,
    ].filter(Boolean).join(" - ");
  }
  if (resultSummary) {
    const rawRows = simulation?.result?.rawRows || simulation?.progress?.rawRows || [];
    const fallback = swapFallbackSummary(rawRows);
    const warnings = simulationWarnings(rawRows, simulation?.result?.dataQuality || simulation?.progress?.dataQuality || null);
    const warningsText = warnings.length ? warnings.join("; ") : "none";
    resultSummary.replaceChildren(
      createResultMetric("Status", simulation.status || "unknown"),
      createResultMetric("Rows", info.rows ? String(info.rows) : ""),
      createResultMetric("Position value", info.currentValue),
      createResultMetric(isStaked ? "AERO earned" : "LP fees earned", info.currentReward || ""),
      createResultMetric("Total return", info.currentTotalReturn || ""),
      createResultMetric("Swap fallback", fallback.details, fallback.details),
      createResultMetric("Elapsed", info.elapsed),
      createResultMetric("Warnings", warningsText, warningsText),
    );
  }
  if (resultLastRow) {
    resultLastRow.textContent = info.notice;
  }
  const liveRows = simulation?.id === serverSimulation.id ? serverSimulation.rawRows : [];
  drawResultChart(simulation?.result?.rawRows || simulation?.progress?.rawRows || liveRows || [], simulation.id || "");
  renderResultTableRows(simulation?.result?.rawRows || simulation?.result?.tableRows || liveRows || []);
}

function openSimulationResultTab(simulation) {
  if (!simulation?.id) return;
  appTabs.results.set(simulation.id, simulation);
  setAppTab(resultTabId(simulation.id));
}

function updateSimulationResultLoading(id, seed = {}, progress = {}) {
  if (!id) return;
  const current = appTabs.results.get(id) || {};
  const loadingSimulation = {
    ...seed,
    ...current,
    id,
    loading: true,
    loadingProgress: {
      ...(current.loadingProgress || {}),
      ...progress,
    },
  };
  appTabs.results.set(id, loadingSimulation);
  if (appTabs.active !== resultTabId(id)) setAppTab(resultTabId(id));
  else {
    renderProjectTabs();
    renderSimulationResultView(loadingSimulation);
  }
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
    if (appTabs.results.get(simulation.id)?.loading) row.classList.add("loading");

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

function serverJobsLoadingPercent(progress = {}) {
  const percent = Number(progress.percent || 0);
  if (Number.isFinite(percent) && percent > 0) return Math.max(0, Math.min(100, Math.round(percent)));
  const stage = String(progress.stage || "").toLowerCase();
  if (stage.includes("parsing")) return 90;
  if (stage.includes("rendering")) return 96;
  if (stage.includes("downloading")) return progress.loaded ? 45 : 25;
  return 10;
}

function serverJobsSyntheticProgress(startedAtMs) {
  const elapsed = Math.max(0, performance.now() - startedAtMs);
  if (elapsed < 350) {
    return {
      stage: "Requesting past simulations...",
      percent: 8 + (elapsed / 350) * 10,
      synthetic: true,
    };
  }
  if (elapsed < 1800) {
    return {
      stage: "Querying stored simulations...",
      percent: 18 + ((elapsed - 350) / 1450) * 54,
      synthetic: true,
    };
  }
  return {
    stage: "Preparing job list...",
    percent: Math.min(88, 72 + ((elapsed - 1800) / 2200) * 16),
    synthetic: true,
  };
}

function renderServerJobsLoading(progress = {}) {
  if (!SERVER_SIMULATION_MODE || !serverJobs || !serverJobsList) return;
  serverJobs.hidden = false;
  serverJobsList.replaceChildren();

  const percent = serverJobsLoadingPercent(progress);
  const placeholder = document.createElement("div");
  placeholder.className = "serverJobsLoading";
  placeholder.setAttribute("role", "status");
  placeholder.setAttribute("aria-live", "polite");

  const header = document.createElement("div");
  header.className = "serverJobsLoadingHeader";
  const title = document.createElement("strong");
  title.textContent = progress.stage || "Loading past simulations...";
  const percentEl = document.createElement("span");
  percentEl.textContent = `${percent}%`;
  header.append(title, percentEl);

  const bar = document.createElement("div");
  bar.className = progress.synthetic || progress.percent ? "serverJobsLoadingBar" : "serverJobsLoadingBar indeterminate";
  const fill = document.createElement("div");
  fill.style.width = `${percent}%`;
  bar.append(fill);

  const details = document.createElement("div");
  details.className = "serverJobsLoadingDetails";
  const detail = progress.synthetic
    ? "Server is reading saved simulations and compacting metadata"
    : resultLoadingDetails(progress);
  details.textContent = `${detail}. The list includes compact metadata for up to 1000 server jobs.`;

  placeholder.append(header, bar, details);
  serverJobsList.append(placeholder);
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
  const resultRawRows = simulation?.result?.rawRows;
  const resultTableRows = simulation?.result?.tableRows;
  const progressRawRows = simulation?.progress?.rawRows;
  const tableRows = Array.isArray(resultRawRows) && resultRawRows.length
    ? resultRawRows
    : Array.isArray(resultTableRows) && resultTableRows.length
      ? resultTableRows
      : Array.isArray(progressRawRows) && progressRawRows.length
        ? progressRawRows
        : serverSimulation.rawRows || [];
  let rowsToRender = tableRows;
  let truncated = false;
  if (tableRows.length > 1000) {
    rowsToRender = [...tableRows.slice(0, 500), null, ...tableRows.slice(-500)];
    truncated = true;
  }

  simTableBody.replaceChildren();
  rowsToRender.forEach((rowItem, i) => {
    if (rowItem === null) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 15;
      td.style.textAlign = "center";
      td.style.padding = "20px";
      td.style.color = "#888";
      td.style.fontStyle = "italic";
      td.textContent = `... ${tableRows.length - 1000} rows hidden to improve performance ...`;
      tr.append(td);
      simTableBody.append(tr);
      return;
    }
    const index = truncated ? (i < 500 ? i : tableRows.length - 1000 + i) : i;
    const tr = document.createElement("tr");
    tr.dataset.index = String(index);
    if (typeof rowItem === "object" && rowItem !== null && rowItem.rebalance?.swapIsFallback) {
      tr.title = `swap fallback: ${summarizeFallbackReason(rowItem.rebalance.quoteFailureReason)}`;
    }
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
  const showPlaceholder = appTabs.active === "history" || showFeedback;
  const hasCachedJobs = serverSimulation.jobsLoaded || serverSimulation.jobs.length > 0;
  if (showPlaceholder && hasCachedJobs && !showFeedback) {
    renderServerJobsList(serverSimulation.jobs);
    if (performance.now() - serverSimulation.jobsLoadedAtMs < 15000) return;
  }
  const requestId = ++serverSimulation.jobsLoadRequestId;
  const feedbackStartedAt = showFeedback ? performance.now() : 0;
  const loadingStartedAt = performance.now();
  let progressTimer = null;
  let loaded = false;
  if (showFeedback) setServerJobsRefreshLoading(true);
  if (showPlaceholder) {
    renderServerJobsLoading(serverJobsSyntheticProgress(loadingStartedAt));
    progressTimer = setInterval(() => {
      if (requestId === serverSimulation.jobsLoadRequestId) renderServerJobsLoading(serverJobsSyntheticProgress(loadingStartedAt));
    }, 120);
  }
  try {
    if (!serverSimulation.jobsLoadPromise) {
      serverSimulation.jobsLoadPromise = fetchJsonWithProgress(
        "/api/simulations?limit=1000",
        {
          progressStage: "Requesting past simulations...",
          downloadStage: "Downloading past simulations...",
          parseStage: "Parsing past simulations...",
        },
        (progress) => {
          if (requestId !== serverSimulation.jobsLoadRequestId || !showPlaceholder) return;
          if (progress.loaded || progress.total || String(progress.stage || "").toLowerCase().includes("parsing")) {
            renderServerJobsLoading(progress);
          }
        },
      ).finally(() => {
        serverSimulation.jobsLoadPromise = null;
      });
    }
    const payload = await serverSimulation.jobsLoadPromise;
    if (requestId !== serverSimulation.jobsLoadRequestId) return;
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    if (showPlaceholder) renderServerJobsLoading({ stage: "Rendering job list...", percent: 96 });
    serverSimulation.jobs = payload.items || [];
    serverSimulation.jobsLoaded = true;
    serverSimulation.jobsLoadedAtMs = performance.now();
    renderServerJobsList(serverSimulation.jobs);
    loaded = true;
  } catch (_) {
    if (requestId !== serverSimulation.jobsLoadRequestId) return;
    serverSimulation.available = false;
    renderServerJobsList([]);
  } finally {
    if (progressTimer) clearInterval(progressTimer);
    if (requestId !== serverSimulation.jobsLoadRequestId) return;
    if (showFeedback) {
      const remainingMs = Math.max(0, 500 - (performance.now() - feedbackStartedAt));
      if (remainingMs > 0) await new Promise((resolve) => setTimeout(resolve, remainingMs));
      setServerJobsRefreshLoading(false);
      if (loaded) showServerJobsRefreshDone();
    }
  }
}

function serverInitializationStage(simulation) {
  const progress = simulation?.progress || {};
  const notice = String(progress.notice || "");
  if (progress.initialRange) return "Starting live simulation...";
  if (notice.includes("Building LP position") || notice.includes("LP")) return "Building LP position...";
  if (notice.includes("Reading pool state") || notice.includes("pool") || notice.includes("slot0")) return "Reading pool state...";
  if (notice.includes("Resolving historical block") || notice.includes("historical block")) return "Resolving historical block...";
  if (serverSimulation.startedAtMs && localElapsedSeconds(serverSimulation.startedAtMs) >= 1) return "Resolving historical block...";
  return "Initializing simulation...";
}

function renderServerSimulation(simulation, options = {}) {
  if (!SERVER_SIMULATION_MODE || !simulation?.id) return;
  serverSimulation.id = simulation.id;
  serverSimulation.lastSimulation = simulation;
  serverSimulation.running = !isServerSimulationTerminal(simulation.status);
  if (!serverSimulation.running) serverSimulation.paused = false;
  if (!serverSimulation.startedAtMs && simulation.created_at) serverSimulation.startedAtMs = simulation.created_at * 1000;
  if (serverSimulation.running && !state.sim.elapsedTimer) startSimulationElapsedTimer(serverSimulation.startedAtMs || Date.now());
  if (!serverSimulation.running) stopSimulationElapsedTimer();
  applyServerRawProgress(simulation);
  const info = serverSimulationText(simulation);
  const params = simulation?.params || {};
  if (params.lpMode && simulationModeSelect) {
    state.sim.lpMode = String(params.lpMode);
    simulationModeSelect.value = state.sim.lpMode;
  }
  const elapsedSeconds = serverElapsedSeconds(simulation);
  const rowsDone = Number(info.rows || 0);
  if (rowsDone > 0 && state.sim.skeletonVisible) setSimulationSkeletonVisible(false);
  if (info.currentValue) currentPositionValue.textContent = info.currentValue;
  if (info.currentReward) currentRewardValue.textContent = info.currentReward;
  if (info.currentTotalReturn) currentTotalValue.textContent = info.currentTotalReturn;
  if (currentRewardLabel) currentRewardLabel.textContent = state.sim.lpMode === "staked" ? "AERO, $" : "LP fees, $";
  const progressSummary = serverProgressSummary(simulation);
  const totalRows = estimateServerTotalRows(simulation);
  setServerSimulationProgressNotice({
    status: serverSimulation.paused
      ? "paused"
      : (rowsDone > 0 ? (simulation.status || "running") : serverInitializationStage(simulation)),
    elapsed: formatCompactDurationSeconds(elapsedSeconds),
    processing: serverProcessingTimestamp(simulation) || (state.sim.initialRangeReady ? simRangeText() : "Range: calculating..."),
    rows: (state.sim.skeletonVisible && !serverSimulation.rawRows.length)
      ? (totalRows > 0 ? `- / ${totalRows}` : "-")
      : (totalRows > 0 ? `${rowsDone} / ${totalRows}` : (rowsDone > 0 ? `${rowsDone} / -` : "-")),
    eta: serverEtaText(simulation, elapsedSeconds, rowsDone, totalRows),
  });
  if (isServerSimulationTerminal(simulation.status) && simulation.status !== "completed" && info.notice) {
    setSimulationNotice({
      status: `Simulation stopped: ${simulation.status}`,
      details: info.notice,
      estimate: "",
      isError: true,
    });
  }
  const index = serverSimulation.jobs.findIndex((item) => item.id === simulation.id);
  if (index >= 0) serverSimulation.jobs[index] = simulation;
  else serverSimulation.jobs.unshift(simulation);
  renderServerJobsList(serverSimulation.jobs);
  syncOpenedSimulation(simulation);
  renderServerObservationMode(progressSummary);
  if (isServerLiveRenderingActive()) renderServerResultTable(simulation);
  if (!rowsDone && serverSimulation.running && !state.sim.skeletonVisible) setSimulationSkeletonVisible(true);
  if (!options.fromTimer) updateSimulationControls();
}

function stopServerSimulationPolling() {
  if (serverSimulation.pollTimer) clearTimeout(serverSimulation.pollTimer);
  serverSimulation.pollTimer = null;
}
function stopServerSimulationEvents() {
  if (serverSimulation.eventSource) serverSimulation.eventSource.close();
  serverSimulation.eventSource = null;
  if (serverSimulation.eventSourceTimer) clearTimeout(serverSimulation.eventSourceTimer);
  serverSimulation.eventSourceTimer = null;
}

async function pollServerSimulation(id) {
  if (!SERVER_SIMULATION_MODE || !id) return;
  try {
    const simulation = await fetchJson(`/api/simulations/${id}?compact=1`);
    renderServerSimulation(simulation);
    if (isServerSimulationTerminal(simulation.status)) {
      stopServerSimulationPolling();
      if (simulation.status === "completed") await renderCompletedServerSimulation(id);
      else loadServerJobs();
    }
  } catch (error) {
    if ((error.status === 429 || error.retryAfterSeconds) && serverSimulation.running) {
      const retryMs = Math.max(5000, error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : (serverSimulation.pollBackoffMs || SERVER_SIMULATION_POLL_MS) * 2);
      serverSimulation.pollBackoffMs = Math.min(60000, retryMs);
      setSimulationNotice({
        status: "The server rate-limited progress polling.",
        details: `Next attempt in ${Math.ceil(retryMs / 1000)}s. The simulation continues on the server.`,
        estimate: "",
      });
      serverSimulation.pollTimer = setTimeout(() => pollServerSimulation(id), retryMs);
      return;
    }
    serverSimulation.running = false;
    stopServerSimulationPolling();
    setSimulationNotice(`Cannot read server simulation: ${error.message}`);
    updateSimulationControls();
  }
}

async function watchServerSimulation(id) {
  stopServerSimulationPolling();
  stopServerSimulationEvents();
  serverSimulation.paused = false;
  serverSimulation.pollBackoffMs = Math.max(5000, SERVER_SIMULATION_POLL_MS);

  // Wait for initial poll to ensure UI has data before starting SSE
  // This also validates the token via fetchJson
  try {
    await pollServerSimulation(id);
  } catch (_) {
    // If poll failed, it will set its own notice, we don't start SSE
    return;
  }

  const adminToken = typeof localStorage !== "undefined" ? localStorage.getItem("walletWatchAdminToken") : "";
  const eventUrl = adminToken
    ? `/api/simulations/${id}/events?admin_token=${encodeURIComponent(adminToken)}`
    : `/api/simulations/${id}/events`;
  const source = new EventSource(eventUrl);
  source.addEventListener("simulation", (event) => {
    try {
      const simulation = JSON.parse(event.data);
      serverSimulation.sseRetryCount = 0;
      renderServerSimulation(simulation);
      if (isServerSimulationTerminal(simulation.status)) {
        stopServerSimulationEvents();
        stopServerSimulationPolling();
        if (simulation.status === "completed") renderCompletedServerSimulation(id).catch((error) => console.error(error));
      }
      serverSimulation.pollBackoffMs = Math.max(5000, SERVER_SIMULATION_POLL_MS);
    } catch (_) { }
  });
  source.addEventListener("terminal", (event) => {
    stopServerSimulationEvents();
    stopServerSimulationPolling();
    let terminalStatus = "";
    try {
      terminalStatus = JSON.parse(event.data || "{}")?.status || "";
    } catch (_) { }
    if (terminalStatus === "completed") {
      renderCompletedServerSimulation(id).catch((error) => {
        console.error(error);
        loadServerJobs();
      });
    } else {
      loadServerJobs();
    }
  });
  source.onerror = () => {
    stopServerSimulationEvents();
    const delayMs = Math.max(5000, serverSimulation.pollBackoffMs || SERVER_SIMULATION_POLL_MS);
    serverSimulation.pollBackoffMs = Math.min(60000, delayMs * 2);

    let errorMessage = "Event stream error (SSE). Check the connection or authorization.";
    if (!adminToken) {
      errorMessage = "SSE error: admin_token is missing. Check authorization.";
    } else if (source.readyState === EventSource.CLOSED) {
      errorMessage = "SSE connection closed. The token may be invalid (401/403) or the server may be unavailable.";
    }
    setSimulationNotice({ status: "SSE Error", details: errorMessage, isError: true });

    // Automatic reconnect attempt if still running
    if (serverSimulation.running && !isServerSimulationTerminal(serverSimulation.lastSimulation?.status)) {
      serverSimulation.sseRetryCount = (serverSimulation.sseRetryCount || 0) + 1;

      if (serverSimulation.sseRetryCount > 3 && (adminToken || source.readyState !== EventSource.CLOSED)) {
        console.log(`SSE reconnect failed ${serverSimulation.sseRetryCount} times. Starting fallback polling (30s)...`);
        serverSimulation.pollBackoffMs = 30000;
        pollServerSimulation(id);
      } else {
        console.log(`SSE connection lost (attempt ${serverSimulation.sseRetryCount}). Reconnecting in ${delayMs}ms...`);
        serverSimulation.eventSourceTimer = setTimeout(() => watchServerSimulation(id), delayMs);
      }
    }
  };
  serverSimulation.eventSource = source;
}

function pauseServerSimulation() {
  if (!SERVER_SIMULATION_MODE || !serverSimulation.id || !serverSimulation.running) return;
  stopServerSimulationPolling();
  stopServerSimulationEvents();
  serverSimulation.running = false;
  serverSimulation.paused = true;
  stopSimulationElapsedTimer();
  setSimulationNotice({ status: "Paused.", details: "", estimate: "" });
  updateSimulationControls();
}

function resumeServerSimulation() {
  if (!SERVER_SIMULATION_MODE || !serverSimulation.id || !serverSimulation.paused) return;
  serverSimulation.running = true;
  serverSimulation.paused = false;
  serverSimulation.rawRows = [];
  startSimulationElapsedTimer(serverSimulation.startedAtMs || Date.now());
  updateSimulationControls();
  watchServerSimulation(serverSimulation.id);
}

async function loadInitialServerSimulations() {
  if (!SERVER_SIMULATION_MODE) return;
  try {
    await loadServerJobs();

    // Check for active simulation at startup to avoid 409 Conflict and resume observation
    const latest = await fetchJson("/api/simulations/latest");
    if (latest && latest.id && !isServerSimulationTerminal(latest.status)) {
      const params = latest.params || {};
      if (params.start) simStartInput.value = params.start;
      if (params.end) simEndInput.value = params.end;
      if (params.deposit) depositInput.value = fmtDeposit(parseNumericInput(params.deposit));
      if (params.rangePct) rangePercentInput.value = fmtPercent(params.rangePct);
      if (params.lpMode) {
        state.sim.lpMode = String(params.lpMode);
        if (simulationModeSelect) simulationModeSelect.value = state.sim.lpMode;
      }

      watchServerSimulation(latest.id);
    }

    updateSimulationControls();
  } catch (_) {
    serverSimulation.available = false;
    updateSimulationControls();
  }
}

async function openServerSimulation(id) {
  if (!SERVER_SIMULATION_MODE || !id) return;
  const seed = serverSimulation.jobs.find((simulation) => simulation.id === id) || appTabs.results.get(id) || { id };
  updateSimulationResultLoading(id, seed, { stage: "Requesting simulation..." });
  try {
    const simulation = await fetchJsonWithProgress(`/api/simulations/${id}`, {}, (progress) => {
      updateSimulationResultLoading(id, seed, progress);
    });
    updateSimulationResultLoading(id, seed, { stage: "Rendering result...", percent: 100 });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    openSimulationResultTab(simulation);
  } catch (error) {
    const failed = {
      ...seed,
      id,
      loading: true,
      loadingProgress: {
        stage: `Failed to load simulation: ${error.message}`,
      },
    };
    appTabs.results.set(id, failed);
    renderSimulationResultView(failed);
    throw error;
  }
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
      serverSimulation.lastSimulation = null;
      serverSimulation.finalResultFetched = false;
      setServerUiMode("live");
      stopServerSimulationPolling();
      stopSimulationElapsedTimer();
      setSimulationSkeletonVisible(false);
      setSimulationNotice("Server simulation deleted.");
      currentPositionValue.textContent = "$0.00";
      currentRewardValue.textContent = "$0.00";
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
    setSimulationNotice("Server API is unavailable. Start the app with scripts/serve_with_rpc.py.");
    return;
  }
  const inputTimestamp = parseInputTime(simStartInput.value);
  const endTimestamp = parseInputTime(simEndInput.value);
  if (Number.isNaN(inputTimestamp) || Number.isNaN(endTimestamp)) {
    setSimulationNotice("Cannot parse dates. Use format 2026-02-01 00:00.");
    return;
  }
  if (endTimestamp <= inputTimestamp) {
    setSimulationNotice("End date must be later than start date.");
    return;
  }
  const depositUsdc = parseNumericInput(depositInput.value);
  const rangePercent = parseRangePercent(rangePercentInput.value);
  if (!Number.isFinite(depositUsdc) || depositUsdc <= 0) {
    setSimulationNotice("Deposit amount must be a positive number.");
    return;
  }
  if (!Number.isFinite(rangePercent) || rangePercent <= 0 || rangePercent >= 100) {
    setSimulationNotice("Range must be a positive number below 100%.");
    return;
  }
  resetSimulationRows();
  setServerUiMode("live");
  serverSimulation.running = true;
  serverSimulation.paused = false;
  serverSimulation.startedAtMs = Date.now();
  serverSimulation.lastSimulation = null;
  serverSimulation.rawRows = [];
  serverSimulation.finalResultFetched = false;
  if (state.rows.length) {
    const startIndex = rowIndexForTimestamp(inputTimestamp, "atOrAfter");
    const endIndex = rowIndexForTimestamp(endTimestamp, "atOrBefore");
    if (endIndex <= startIndex) {
      setSimulationNotice("End date must be later than start date.");
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
    captureSimulationInitialChartView();
    draw();
  }
  updateSimulationControls();
  state.sim.initializing = true;
  state.sim.startupStage = "Initializing simulation...";
  state.sim.elapsedStartedAtMs = serverSimulation.startedAtMs;
  setSimulationSkeletonVisible(true);
  startSimulationElapsedTimer(serverSimulation.startedAtMs);
  const totalRows = Math.max(0, state.sim.endIndex - state.sim.startIndex + 1);
  renderServerObservationMode({
    status: "starting",
    elapsed: "0s",
    processing: "starting",
    rows: totalRows > 0 ? `0 / ${totalRows}` : "0 / -",
    eta: "-",
  });
  setServerSimulationProgressNotice({
    status: "starting",
    elapsed: "0s",
    processing: "-",
    rows: totalRows > 0 ? `0 / ${totalRows}` : "0 / -",
    eta: "-",
  });
  try {
    const simulation = await fetchJson("/api/simulations", {
      method: "POST",
      body: JSON.stringify({
        start: fmtInputTime(inputTimestamp),
        end: fmtInputTime(endTimestamp),
        deposit: String(depositUsdc),
        rangePct: rangePercent,
        lpMode: state.sim.lpMode,
        progressEverySeconds: 2,
      }),
    });
    renderServerSimulation(simulation);
    watchServerSimulation(simulation.id);
    loadServerJobs();
  } catch (error) {
    serverSimulation.running = false;
    serverSimulation.paused = false;
    stopSimulationElapsedTimer();
    setSimulationSkeletonVisible(false);
    setSimulationNotice(`Failed to start server simulation: ${error.message}`, true);
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
    setSimulationNotice("Simulation start canceled. Press START to begin again.");
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
      setSimulationNotice({ status: "Paused.", details: simulationProgressText(), estimate: "" });
    }
    return;
  }
  if (!state.rows.length) return;
  resetSimulationRows();
  const inputTimestamp = parseInputTime(simStartInput.value);
  if (Number.isNaN(inputTimestamp)) {
    setSimulationNotice("Cannot parse start date. Use format 2026-02-01 00:00.");
    return;
  }
  const endTimestamp = parseInputTime(simEndInput.value);
  if (Number.isNaN(endTimestamp)) {
    setSimulationNotice("Cannot parse end date. Use format 2026-04-30 23:59.");
    return;
  }
  const startIndex = rowIndexForTimestamp(inputTimestamp, "atOrAfter");
  const endIndex = rowIndexForTimestamp(endTimestamp, "atOrBefore");
  if (endIndex <= startIndex) {
    setSimulationNotice("End date must be later than start date.");
    return;
  }
  const startRow = state.rows[startIndex];
  const depositUsdc = parseNumericInput(depositInput.value);
  if (!Number.isFinite(depositUsdc) || depositUsdc <= 0) {
    setSimulationNotice("Deposit amount must be a positive number.");
    return;
  }
  const rangePercent = parseRangePercent(rangePercentInput.value);
  if (!Number.isFinite(rangePercent) || rangePercent <= 0 || rangePercent >= 100) {
    setSimulationNotice("Range must be a positive number below 100%.");
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
  captureSimulationInitialChartView();
  state.sim.initializing = true;
  state.sim.autoRunning = true;
  state.sim.elapsedStartedAtMs = Date.now();
  state.sim.startupStage = "Initializing simulation...";
  const runToken = state.sim.runToken;
  updateSimulationControls();
  setSimulationSkeletonVisible(true);
  startSimulationElapsedTimer(state.sim.elapsedStartedAtMs);
  draw();

  setSimulationStartupStage("Initializing simulation...");
  try {
    setSimulationStartupStage("Resolving historical block...");
    const block = await findBlockAtOrAfter(Math.floor(new Date(startRow.time).getTime() / 1000), 1);
    ensureActiveSimulation(runToken, false);
    setSimulationStartupStage("Reading pool state...");
    const slot = await readPoolSlot0(POOL_ADDRESS, block.number);
    ensureActiveSimulation(runToken, false);
    setSimulationStartupStage("Building LP position...");
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
    state.sim.initialRangeReady = true;
    setSimulationChartPriceBounds(startIndex, endIndex);
    updateSimulationInitialChartBounds();
    renderStartupNotice();
    draw();
    state.sim.liquidityRaw = plan.liquidityRaw;
    state.sim.liquidityHuman = plan.liquidityHuman;
    setSimulationStartupStage("Starting live simulation...");
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
    setSimulationSkeletonVisible(false);
    stopSimulationElapsedTimer();
    setSimulationNotice({ status: "Simulation started.", details: simulationProgressText(), estimate: "" });
    renderSimulationTable(true);
    state.sim.autoLoopId += 1;
    runAutoSimulationLoop(state.sim.runToken, state.sim.autoLoopId);
  } catch (error) {
    if (runToken !== state.sim.runToken) return;
    resetSimulationRows();
    console.error(error); setSimulationNotice(`Simulation stopped: ${error.stack || error.message}`, true);
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
  setSimulationNotice({ status: "Stepped back.", details: simulationProgressText(), estimate: "" });
  renderSimulationTable();
}

function resetSimulation() {
  resetSimulationRows();
  serverSimulation.rawRows = [];
  serverSimulation.finalResultFetched = false;
  if (SERVER_SIMULATION_MODE) setServerUiMode("live");
  setSimulationNotice("Simulation reset. Press START to begin again.");
}

function resetOrStopSimulation() {
  if (SERVER_SIMULATION_MODE && serverSimulation.id && (serverSimulation.running || serverSimulation.paused)) {
    cancelServerSimulation(serverSimulation.id).catch((error) => {
      setSimulationNotice(`Failed to stop server simulation: ${error.message}`);
    });
    return;
  }
  resetSimulation();
}

async function runAutoSimulationLoop(runToken, loopId) {
  return await simulationEngine.runAutoLoop(runToken, loopId);
}

canvas.addEventListener("wheel", (event) => {
  const scroller = document.scrollingElement || document.documentElement;
  const canScrollPage = scroller && scroller.scrollHeight > scroller.clientHeight + 1;
  const simulationActive = state.sim.started || state.sim.initializing || state.sim.autoRunning || serverSimulation.running || serverSimulation.paused;
  if (canScrollPage && !simulationActive) {
    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    const wantsScrollUp = event.deltaY < 0;
    const wantsScrollDown = event.deltaY > 0;
    if ((wantsScrollUp && !atTop) || (wantsScrollDown && !atBottom)) return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const padLeft = 72;
  const padRight = 72;
  const plotW = canvas.clientWidth - padLeft - padRight;
  const ratio = Math.min(1, Math.max(0, (x - padLeft) / plotW));
  event.preventDefault();
  if (simulationActive && hasSimulationInitialChartView()) {
    state.sim.userAdjustedChartView = true;
    updateResetChartViewButton();
  }
  state.hoverIndex = -1;
  zoomAt(ratio, event.deltaY);
  state.releaseRows = null;
  updateMetrics(getVisibleRows());
  draw();
}, { passive: false });

if (resetChartViewButton) {
  resetChartViewButton.addEventListener("click", resetToSimulationInitialChartView);
}

async function renderCompletedServerSimulation(id) {
  if (!SERVER_SIMULATION_MODE || !id || serverSimulation.finalResultFetched) return;
  serverSimulation.finalResultFetched = true;
  try {
    const simulation = await fetchJson(`/api/simulations/${id}`);
    serverSimulation.liveViewOpen = true;
    serverSimulation.uiMode = "live";
    if (simNotice) simNotice.hidden = false;
    renderServerSimulation(simulation);
    openSimulationResultTab(simulation);
  } finally {
    loadServerJobs();
  }
}

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

if (resultPriceChart) {
  resultPriceChart.addEventListener("wheel", (event) => {
    const resultId = appTabs.active?.startsWith("result:") ? appTabs.active.slice("result:".length) : "";
    const simulation = resultId ? appTabs.results.get(resultId) : null;
    if (!simulation || simulation.loading) return;
    const liveRows = simulation?.id === serverSimulation.id ? serverSimulation.rawRows : [];
    const rawRows = simulation?.result?.rawRows || simulation?.progress?.rawRows || liveRows || [];
    const chartRows = resultChartRows(rawRows);
    if (chartRows.length <= 2) return;
    const rect = resultPriceChart.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const padLeft = 72;
    const padRight = 72;
    const plotW = Math.max(1, resultPriceChart.clientWidth - padLeft - padRight);
    const ratio = Math.min(1, Math.max(0, (x - padLeft) / plotW));
    event.preventDefault();
    state.resultChart.hoverIndex = -1;
    resultZoomAt(ratio, event.deltaY, chartRows.length);
    drawResultChart(rawRows, simulation.id || resultId);
  }, { passive: false });

  resultPriceChart.addEventListener("mousemove", (event) => {
    const resultId = appTabs.active?.startsWith("result:") ? appTabs.active.slice("result:".length) : "";
    const simulation = resultId ? appTabs.results.get(resultId) : null;
    if (!simulation || simulation.loading || state.resultChart.isDragging) return;
    const liveRows = simulation?.id === serverSimulation.id ? serverSimulation.rawRows : [];
    const rawRows = simulation?.result?.rawRows || simulation?.progress?.rawRows || liveRows || [];
    const visibleRows = resultVisibleRows(resultChartRows(rawRows));
    if (!visibleRows.length) return;
    const rect = resultPriceChart.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const padLeft = 72;
    const padRight = 72;
    const plotW = Math.max(1, resultPriceChart.clientWidth - padLeft - padRight);
    const ratio = Math.min(1, Math.max(0, (x - padLeft) / plotW));
    state.resultChart.hoverIndex = Math.round(ratio * (visibleRows.length - 1));
    drawResultChart(rawRows, simulation.id || resultId);
  });

  resultPriceChart.addEventListener("mouseleave", () => {
    if (state.resultChart.hoverIndex < 0 || state.resultChart.isDragging) return;
    state.resultChart.hoverIndex = -1;
    drawActiveResultChart();
  });

  resultPriceChart.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || state.resultChart.zoomEnd - state.resultChart.zoomStart >= 1) return;
    event.preventDefault();
    state.resultChart.isDragging = true;
    state.resultChart.hoverIndex = -1;
    state.resultChart.dragX = event.clientX;
    state.resultChart.dragStart = state.resultChart.zoomStart;
    state.resultChart.dragEnd = state.resultChart.zoomEnd;
    resultPriceChart.style.cursor = "grabbing";
    document.body.style.cursor = "grabbing";
  });
}

window.addEventListener("mousemove", (event) => {
  if (!state.resultChart.isDragging || !resultPriceChart) return;
  event.preventDefault();
  const padLeft = 72;
  const padRight = 72;
  const plotW = Math.max(1, resultPriceChart.clientWidth - padLeft - padRight);
  const deltaRatio = -(event.clientX - state.resultChart.dragX) / plotW * (state.resultChart.dragEnd - state.resultChart.dragStart);
  resultPanBy(deltaRatio);
  drawActiveResultChart();
});

function finishResultChartDrag() {
  if (!state.resultChart.isDragging) return;
  state.resultChart.isDragging = false;
  if (resultPriceChart) resultPriceChart.style.cursor = "";
  document.body.style.cursor = "";
  drawActiveResultChart();
}

window.addEventListener("mouseup", finishResultChartDrag);
window.addEventListener("blur", finishResultChartDrag);

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
    setSimulationNotice("Cannot parse start date. Use format 2026-02-01 00:00.");
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
    setSimulationNotice("Cannot parse end date. Use format 2026-04-30 23:59.");
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
simulationModeSelect.addEventListener("change", () => {
  state.sim.lpMode = simulationModeSelect.value;
  resetSimulationRows();
  updateSimulationControls();
});
if (openLiveViewButton) openLiveViewButton.addEventListener("click", openServerLiveView);
if (closeLiveViewButton) closeLiveViewButton.addEventListener("click", closeServerLiveView);
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
      openServerSimulation(id).catch((error) => console.error(error));
      return;
    }
    const action = button.dataset.action;
    if (action === "cancel") cancelServerSimulation(id);
    if (action === "delete") deleteServerSimulation(id, row).catch((error) => console.error(error));
  });
}
if (stepForward) {
  stepForward.addEventListener("click", () => {
    stepSimulationForward();
  });
}
if (stepBack) stepBack.addEventListener("click", stepSimulationBack);

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

window.addEventListener("resize", () => {
  draw();
  drawActiveResultChart();
});

function formatCsvBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame() {
  if (typeof requestAnimationFrame === "function") {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return delay(0);
}

async function waitForCsvProcessingSlot(stage) {
  statusEl.textContent = stage;
  await nextFrame();
  while (appTabs.active === "history") {
    statusEl.textContent = `${stage} (paused while viewing past simulations)`;
    await delay(250);
  }
  statusEl.textContent = stage;
  await nextFrame();
}

async function loadCsvWithProgress(url) {
  statusEl.textContent = "Loading CSV... 0%";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CSV load failed: ${response.status}`);
  const total = Number(response.headers?.get?.("content-length") || 0);
  if (!response.body || !response.body.getReader) {
    const text = await response.text();
    statusEl.textContent = `CSV downloaded (${formatCsvBytes(text.length)}), processing...`;
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let lastUpdate = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const now = performance.now();
    if (now - lastUpdate > 100) {
      if (total > 0) {
        const percent = Math.min(100, Math.round((received / total) * 100));
        statusEl.textContent = `Loading CSV... ${percent}% (${formatCsvBytes(received)} of ${formatCsvBytes(total)})`;
      } else {
        statusEl.textContent = `Loading CSV... ${formatCsvBytes(received)}`;
      }
      lastUpdate = now;
    }
  }
  statusEl.textContent = `CSV downloaded (${formatCsvBytes(received)}), processing...`;
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}

loadServerJobs();

loadCsvWithProgress(CSV_FILE)
  .then(async (text) => {
    await loadServerJobs();
    await delay(CSV_PROCESSING_GRACE_MS);
    await waitForCsvProcessingSlot("CSV downloaded, parsing...");
    const csvRows = parseCsv(text);
    await waitForCsvProcessingSlot("CSV parsed, checking data quality...");
    state.dataQuality = analyzeDataQuality(csvRows);
    state.dataQuality.source = CSV_FILE;
    await waitForCsvProcessingSlot("CSV parsed, building minute grid...");
    state.rows = buildCompleteMinuteRows(csvRows);
    state.dataQuality.minuteRowCount = state.rows.length;
    statusEl.textContent = dataQualityStatus(state.dataQuality);
    statusEl.title = dataQualityTitle(state.dataQuality);
    await waitForCsvProcessingSlot(statusEl.textContent);
    setSimulationStart(0);
    setSimulationEnd(state.rows.length - 1);
    resetSimulationRows();
    setActiveTimeInput("start");
    updateRange("all");
    loadInitialServerSimulations();
  })
  .catch((error) => {
    statusEl.textContent = `CSV not loaded, ${error.message}`;
    statusEl.title = error.stack || error.message;
    console.error(error);
  });

globalThis.getSimulationRawRows = getSimulationRawRows;
globalThis.getSimulationRawRowsFrom = getSimulationRawRowsFrom;
globalThis.getSimulationRawRowCount = getSimulationRawRowCount;
globalThis.getSimulationDisplayRows = getSimulationDisplayRows;
globalThis.getSimulationDisplayState = getSimulationDisplayState;
globalThis.getSimulationDataQuality = getSimulationDataQuality;
globalThis.getSimulationTiming = getSimulationTiming;
globalThis.buildCompleteMinuteRows = buildCompleteMinuteRows;
