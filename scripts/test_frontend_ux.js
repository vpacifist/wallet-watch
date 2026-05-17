const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const core = fs.readFileSync(path.join(ROOT, "simulation_core.js"), "utf8");
const engine = fs.readFileSync(path.join(ROOT, "simulation_engine.js"), "utf8");
const runtime = fs.readFileSync(path.join(ROOT, "scripts", "simulation_runtime.js"), "utf8");
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

function appearsInOrder(source, labels) {
  let offset = -1;
  for (const label of labels) {
    const next = source.indexOf(label, offset + 1);
    assert.notEqual(next, -1, `${label} should be present`);
    assert.ok(next > offset, `${label} should appear after the previous stage`);
    offset = next;
  }
}

function testLocalElapsedTimer() {
  assert.match(app, /function startSimulationElapsedTimer\(startedAtMs = Date\.now\(\)\)/);
  assert.match(app, /setInterval\(\(\) => \{/);
  assert.match(app, /localElapsedSeconds\(serverSimulation\.startedAtMs\)/);
  assert.doesNotMatch(app, /const progressElapsed = Number\(simulation\?\.progress\?\.elapsedSeconds/);
}

function testInitializationStages() {
  appearsInOrder(app, [
    "Initializing simulation...",
    "Resolving historical block...",
    "Reading pool state...",
    "Building LP position...",
    "Starting live simulation...",
  ]);
  assert.match(app, /function serverInitializationStage\(simulation\)/);
  assert.match(app, /rowsDone > 0 \? \(simulation\.status \|\| "running"\) : serverInitializationStage\(simulation\)/);
}

function testSkeletonLifecycle() {
  assert.match(app, /function setSimulationSkeletonVisible\(visible\)/);
  assert.match(app, /setSimulationSkeletonVisible\(true\)/);
  assert.match(app, /setSimulationSkeletonVisible\(false\)/);
  assert.match(app, /function renderSimulationTableSkeleton\(\)/);
  assert.match(styles, /\.skeletonLine/);
  assert.match(styles, /@keyframes skeletonPulse/);
}

function testEarlyRangeRendering() {
  assert.match(app, /state\.sim\.initialRangeReady = true/);
  assert.match(app, /function applyInitialRange\(range\)/);
  assert.match(app, /progress\.initialRange/);
  assert.match(runtime, /initialRange: startup\.initialRange \|\| null/);
  assert.match(app, /if \(\(!state\.sim\.started && !state\.sim\.initialRangeReady\) \|\| !state\.sim\.rangeStepTicks\) return \[\]/);
}

function testSseDelayedStartHandling() {
  assert.match(runtime, /emit\(progressEvent\(config, startedAt, state, readRawRows\(sandbox\), \[\], "initializing", sandbox\)\)/);
  assert.match(runtime, /stage: startup\.stage \|\| ""/);
  assert.match(runtime, /skeletonVisible: Boolean\(startup\.skeletonVisible\)/);
  assert.match(app, /Range: calculating\.\.\./);
}

function testSseErrorRecoveryNotice() {
  assert.match(app, /sseErrorActive: false/);
  assert.match(app, /if \(serverSimulation\.sseErrorActive && simNotice\.classList\.contains\("simNoticeError"\) && simNotice\.textContent\.includes\("SSE"\)\) \{/);
  assert.match(app, /estimateEl\.replaceChildren\(\)/);
  assert.match(app, /serverSimulation\.sseRetryCount = 0;\s+stopServerSimulationEvents\(\);\s+watchServerSimulation\(serverSimulation\.id\);/);
  assert.match(app, /serverSimulation\.sseErrorActive = false;\s+renderServerSimulation\(simulation\);/);
  assert.match(app, /serverSimulation\.sseErrorActive = true;\s+const delayMs = Math\.max/);
}

function testBlockByNumberCacheLifecycle() {
  assert.match(app, /blockByNumberCache: new Map\(\)/);
  assert.match(app, /state\.sim\.blockByNumberCache\.get\(blockNumber\)/);
  assert.match(app, /state\.sim\.blockByNumberCache\.set\(blockNumber, normalized\)/);
  assert.match(app, /state\.sim\.blockByNumberCache = new Map\(\)/);
}

function testSimulationTimingInstrumentation() {
  assert.match(app, /function recordSimulationTiming\(name, startedAt\)/);
  assert.match(app, /globalThis\.getSimulationTiming = getSimulationTiming/);
  assert.match(engine, /recordSimulationTiming\("stepForward"/);
  assert.match(engine, /recordSimulationTiming\("buildSimulationRow"/);
  assert.match(engine, /recordSimulationTiming\("runAutoLoop\.renderSimulationTable"/);
  assert.match(engine, /runAutoLoop\.workerProgressSkip/);
  assert.match(app, /if \(IS_SERVER_WORKER\) \{/);
  assert.match(app, /isServerWorker: IS_SERVER_WORKER/);
  assert.match(runtime, /timing: readTiming\(sandbox\)/);
  assert.match(runtime, /progressRowBatchSize/);
  assert.match(app, /\/api\/simulations\/\$\{id\}\?compact=1/);
  assert.match(runtime, /getSimulationRawRowsFrom/);
  assert.match(runtime, /getSimulationDisplayState/);
}

function testSubhourTimeAxisLabels() {
  assert.match(app, /fmtAxisMinute/);
  assert.match(app, /const MIN_CHART_ZOOM_ROWS = 30/);
  assert.match(app, /const MINUTE_AXIS_MAX_MINUTES = 180/);
  assert.match(app, /function minuteTickStep\(visibleMinutes, plotWidth\)/);
  assert.match(app, /const showMinuteScale = visibleMinutes > 0 && visibleMinutes <= MINUTE_AXIS_MAX_MINUTES/);
  assert.match(app, /ticks\.minuteTicks\.forEach/);
  assert.match(app, /MIN_CHART_ZOOM_ROWS \/ rows\.length/);
  assert.match(app, /MIN_CHART_ZOOM_ROWS \/ rowCount/);
  assert.match(core, /function fmtAxisMinute\(value\)/);
}


function testSimulationModes() {
  // UI mode controls in app.js
  assert.match(app, /lpMode/);
  assert.match(app, /simulationModeSelect/);
  assert.match(app, /state\.sim\.lpMode = simulationModeSelect\.value/);
  assert.match(app, /currentRewardLabel/);
  assert.match(app, /currentRewardValue/);
  assert.match(app, /currentTotalValue/);
  assert.match(app, /aeroTh/);
  assert.match(app, /lpFeesTh/);

  // Economic model metadata in simulation_engine.js
  assert.match(engine, /includedRewardStreams/);
  assert.match(engine, /excludedRewardStreams/);
  assert.match(engine, /lpFeesClaimable/);
  assert.match(engine, /aeroClaimable/);
  assert.match(engine, /totalReturnUsdc/);
}

function testServerObservationModes() {
  assert.doesNotMatch(html, /id="serverUiModeSelect"/);
  assert.doesNotMatch(html, />UI mode</);
  assert.match(html, /id="serverBackgroundOverlay"/);
  assert.match(html, /id="openLiveView"/);
  assert.match(html, /id="closeLiveView"/);
  assert.match(html, /id="backgroundProgressPanel"/);

  assert.match(app, /uiMode: "live"/);
  assert.match(app, /liveViewOpen: true/);
  assert.match(app, /function setServerUiMode\(mode\)/);
  assert.match(app, /setServerUiMode\("live"\)/);
  assert.match(app, /function openServerLiveView\(\)/);
  assert.match(app, /function closeServerLiveView\(\)/);
  assert.match(app, /function isServerLiveRenderingActive\(\)/);
  assert.match(app, /if \(!isServerLiveRenderingActive\(\) && !Array\.isArray\(resultRows\)\) \{/);
  assert.match(app, /if \(isServerLiveRenderingActive\(\)\) renderServerResultTable\(simulation\)/);
  assert.match(app, /renderCompletedServerSimulation\(id\)/);
  assert.match(app, /fetchJson\(`\/api\/simulations\/\$\{id\}`\)/);
  assert.match(app, /function fetchJsonWithProgress\(url, options = \{\}, onProgress = null\)/);
  assert.match(app, /request\.onprogress = \(event\) =>/);
  assert.match(app, /function renderSimulationResultLoading\(simulation\)/);
  assert.match(app, /updateSimulationResultLoading\(id, seed, progress\)/);
  assert.match(app, /function renderServerJobsLoading\(progress = \{\}\)/);
  assert.match(app, /function serverJobsSyntheticProgress\(startedAtMs\)/);
  assert.match(app, /Requesting past simulations/);
  assert.match(app, /Querying stored simulations/);
  assert.match(app, /Preparing job list/);
  assert.match(app, /Downloading past simulations/);
  assert.match(app, /Parsing past simulations/);
  assert.match(app, /const rowsToRender = tableRows\.length > 1000/);
  assert.match(app, /rows hidden to improve performance/);
  assert.match(styles, /\.resultLoadingBar/);
  assert.match(styles, /\.serverJobsLoadingBar/);
  assert.match(styles, /\.serverJob\.loading/);
  assert.match(styles, /\.chartOverlay/);
  assert.match(styles, /\.backgroundProgressPanel/);
}

function testResultChartHoverTooltip() {
  assert.match(html, /id="resultTooltip"/);
  assert.match(app, /const resultTooltip = document\.getElementById\("resultTooltip"\)/);
  assert.match(app, /function resultChartTooltip\(row\)/);
  assert.match(app, /WETH <strong>\$\{fmtPrice\(displayPrice\)\}<\/strong>/);
  assert.match(app, /if \(row\?\.rebalance\) \{/);
  assert.match(app, /placeChartTooltip\(resultTooltip, x, y, width, height\)/);
  assert.match(styles, /\.resultTooltip/);
}


testLocalElapsedTimer();
testInitializationStages();
testSkeletonLifecycle();
testEarlyRangeRendering();
testSseDelayedStartHandling();
testSseErrorRecoveryNotice();
testBlockByNumberCacheLifecycle();
testSimulationTimingInstrumentation();
testSubhourTimeAxisLabels();
testSimulationModes();
testServerObservationModes();
testResultChartHoverTooltip();
