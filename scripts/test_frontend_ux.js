const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
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

function testSimulationModes() {
  assert.match(app, /lpMode/);
  assert.match(app, /simulationModeSelect/);
  assert.match(app, /state\.sim\.lpMode = simulationModeSelect\.value/);
  assert.match(app, /includedRewardStreams/);
  assert.match(app, /excludedRewardStreams/);
  assert.match(app, /lpFeesClaimable/);
  assert.match(app, /aeroClaimable/);
  assert.match(app, /totalReturnUsdc/);
  assert.match(app, /currentRewardLabel/);
  assert.match(app, /currentRewardValue/);
  assert.match(app, /currentTotalValue/);
  assert.match(app, /aeroTh/);
  assert.match(app, /lpFeesTh/);
}

testLocalElapsedTimer();
testInitializationStages();
testSkeletonLifecycle();
testEarlyRangeRendering();
testSseDelayedStartHandling();
testSimulationModes();
