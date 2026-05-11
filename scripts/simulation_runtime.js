const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    this.element.className = Array.from(this.values).join(" ");
    return enabled;
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
    this.element.className = Array.from(this.values).join(" ");
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
    this.element.className = Array.from(this.values).join(" ");
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(id = "", tagName = "div") {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.value = "";
    this.textContent = "";
    this.title = "";
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.listeners = new Map();
    this.className = "";
    this.classList = new FakeClassList(this);
    this.clientWidth = id === "priceChart" ? 1400 : 1200;
    this.clientHeight = id === "priceChart" ? 560 : 480;
    this.scrollTop = 0;
    this._innerHTML = "";
    this._rows = [];
    this.attributes = {};
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value || "");
    if (this.id === "simTableBody") this._parseRows();
  }

  _parseRows() {
    this._rows = [];
    const rowPattern = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/g;
    let match;
    while ((match = rowPattern.exec(this._innerHTML))) {
      const row = new FakeElement("", "tr");
      const indexMatch = match[1].match(/data-index="([^"]+)"/);
      if (indexMatch) row.dataset.index = indexMatch[1];
      const classMatch = match[1].match(/class="([^"]+)"/);
      if (classMatch) row.className = classMatch[1];
      const cells = [];
      const cellPattern = /<td\b[^>]*>([\s\S]*?)<\/td>/g;
      let cellMatch;
      while ((cellMatch = cellPattern.exec(match[2]))) {
        cells.push(cellMatch[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
      }
      row.textContent = cells.join("\t");
      this._rows.push(row);
    }
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) handler.call(this, event);
    return true;
  }

  append(...children) {
    this.children.push(...children);
  }

  remove() {
    this.removed = true;
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  querySelector(selector) {
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      return this.children.find((child) => child.className === className || child.classList?.values?.has(className)) || null;
    }
    if (selector.startsWith("tr[data-index=")) {
      const index = selector.match(/"([^"]+)"/)?.[1];
      return this._rows.find((row) => row.dataset.index === index) || null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === "tr" || selector === "tr[data-index]") return this._rows;
    if (selector === ".skeletonRow") return this._rows.filter((row) => row.className.includes("skeletonRow"));
    return [];
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: this.clientWidth,
      bottom: this.clientHeight,
      width: this.clientWidth,
      height: this.clientHeight,
    };
  }

  getContext() {
    return fakeCanvasContext;
  }
}

const fakeCanvasContext = new Proxy({}, {
  get(target, prop) {
    if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
    if (prop === "createLinearGradient") return () => ({ addColorStop() { } });
    if (!(prop in target)) target[prop] = () => { };
    return target[prop];
  },
  set(target, prop, value) {
    target[prop] = value;
    return true;
  },
});

function makeDocument() {
  const ids = [
    "priceChart",
    "tooltip",
    "simTooltip",
    "tableTooltip",
    "status",
    "rangeNavigator",
    "rangeTrack",
    "rangeWindow",
    "simStartInput",
    "simEndInput",
    "depositInput",
    "rangePercentInput",
    "runSimulation",
    "resetSimulation",
    "stepBack",
    "stepForward",
    "currentPositionValue",
    "currentTotalValue",
    "currentRewardValue",
    "currentRewardLabel",
    "simulationModeSelect",
    "simNotice",
    "simTableWrap",
    "simTableBody",
    "serverJobs",
    "serverJobsList",
    "refreshServerJobs",
    "refreshDoneCheck",
    "appTabNew",
    "appTabHistory",
    "resultTabs",
    "chartView",
    "newSimulationView",
    "historyView",
    "simulationResultView",
    "resultTitle",
    "resultSubtitle",
    "resultSummary",
    "resultLastRow",
    "resultTableWrap",
    "resultTableBody",
    "resultEmpty",
  ];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id, id === "priceChart" ? "canvas" : "div")]));
  elements.get("simStartInput").value = "2026-02-01 00:00";
  elements.get("simEndInput").value = "2026-04-30 23:59";
  elements.get("depositInput").value = "10'000";
  elements.get("rangePercentInput").value = "1";
  elements.get("runSimulation").textContent = "START";
  elements.get("currentPositionValue").textContent = "$0.00";
  elements.get("simNotice").textContent = "";

  const filterButtons = ["all", "2026-02", "2026-03", "2026-04"].map((range) => {
    const button = new FakeElement("", "button");
    button.dataset.range = range;
    return button;
  });

  return {
    body: new FakeElement("body", "body"),
    createElement: (tagName) => new FakeElement("", tagName),
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: (selector) => selector === ".filters button" ? filterButtons : [],
    _elements: elements,
  };
}

function normalizeUrl(config, url) {
  const origin = new URL(config.url || "http://127.0.0.1:8003/index.html").origin;
  return new URL(url, origin).toString();
}

async function workerFetch(config, url, options = {}) {
  const textUrl = String(url);
  if (textUrl.endsWith(".csv") || textUrl.startsWith("./weth_")) {
    const csvPath = path.join(ROOT, textUrl.replace(/^\.\//, ""));
    const body = await fs.promises.readFile(csvPath, "utf8");
    return { ok: true, status: 200, text: async () => body };
  }
  return await fetch(normalizeUrl(config, textUrl), options);
}

function readUi(document) {
  const table = document.getElementById("simTableBody");
  const rows = table.querySelectorAll("tr");
  const lastRow = rows.length ? rows[rows.length - 1].textContent : "";
  const notice = document.getElementById("simNotice");
  const noticeText = notice.children.length
    ? notice.children.map((child) => child.textContent || "").filter(Boolean).join("\n")
    : notice.textContent || "";
  return {
    notice: noticeText,
    rowCount: rows.length,
    lastRow,
    button: document.getElementById("runSimulation").textContent || "",
    currentValue: document.getElementById("currentPositionValue").textContent || "",
    currentReward: document.getElementById("currentRewardValue").textContent || "",
  };
}

function readTableRows(document) {
  const table = document.getElementById("simTableBody");
  return Array.from(table.querySelectorAll("tr"), (row) => row.textContent || "");
}

function readRawRows(sandbox) {
  if (typeof sandbox.getSimulationRawRows !== "function") return [];
  return sandbox.getSimulationRawRows();
}

function readStartupState(sandbox) {
  if (typeof sandbox.getSimulationStartupState !== "function") return {};
  return sandbox.getSimulationStartupState() || {};
}

function progressEvent(config, startedAt, state, rawRows, newRawRows, reason = "heartbeat", sandbox = null) {
  const startup = readStartupState(sandbox || {});
  return {
    type: "progress",
    id: config.id,
    reason,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    rows: state.rowCount,
    button: state.button,
    notice: state.notice,
    lastRow: state.lastRow,
    currentValue: state.currentValue,
    currentReward: state.currentReward,
    latestRawRow: rawRows.at(-1) || null,
    newRawRows,
    stage: startup.stage || "",
    skeletonVisible: Boolean(startup.skeletonVisible),
    initialRange: startup.initialRange || null,
  };
}

function readDataQuality(sandbox) {
  if (typeof sandbox.getSimulationDataQuality !== "function") return null;
  return sandbox.getSimulationDataQuality();
}

async function runSimulation(config, emit = () => { }) {
  if (!config.start || !config.end) {
    emit({ type: "result", status: "error", message: "SERVER_SIM_CONFIG requires start and end" });
    return { exitCode: 4 };
  }

  const document = makeDocument();
  const sandbox = {
    console,
    document,
    fetch: (url, options) => workerFetch(config, url, options),
    performance,
    URLSearchParams,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    BigInt,
    Math,
    Number,
    String,
    Date,
    Map,
    Promise,
    Error,
    RegExp,
    JSON,
    SERVER_SIM_CONFIG_CLIENT: config,
    window: {
      location: { search: "" },
      devicePixelRatio: 1,
      addEventListener() { },
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout,
    },
  };
  sandbox.globalThis = sandbox;

  const coreSource = await fs.promises.readFile(path.join(ROOT, "simulation_core.js"), "utf8");
  const engineSource = await fs.promises.readFile(path.join(ROOT, "simulation_engine.js"), "utf8");
  const appSource = await fs.promises.readFile(path.join(ROOT, "app.js"), "utf8");
  vm.createContext(sandbox);
  vm.runInContext(coreSource, sandbox, { filename: "simulation_core.js" });
  vm.runInContext(engineSource, sandbox, { filename: "simulation_engine.js" });
  vm.runInContext(appSource, sandbox, { filename: "app.js" });

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !document.getElementById("status").textContent.startsWith("CSV загружен")) {
    await sleep(50);
  }
  if (!document.getElementById("status").textContent.startsWith("CSV загружен")) {
    throw new Error("CSV did not load before timeout");
  }

  document.getElementById("simStartInput").value = config.start;
  document.getElementById("simEndInput").value = config.end;
  document.getElementById("depositInput").value = String(config.deposit || "10000");
  document.getElementById("rangePercentInput").value = String(config.rangePct || 1);
  if (config.lpMode && document.getElementById("simulationModeSelect")) {
    document.getElementById("simulationModeSelect").value = String(config.lpMode);
    document.getElementById("simulationModeSelect").dispatchEvent({ type: "change" });
  }

  emit({
    type: "inputs",
    id: config.id,
    start: document.getElementById("simStartInput").value,
    end: document.getElementById("simEndInput").value,
    deposit: document.getElementById("depositInput").value,
    rangePct: document.getElementById("rangePercentInput").value,
    lpMode: document.getElementById("simulationModeSelect")?.value || "",
  });

  const startedAt = Date.now();
  let startSettled = false;
  let startError = null;
  const startPromise = sandbox.startSimulation()
    .catch((error) => {
      startError = error;
    })
    .finally(() => {
      startSettled = true;
    });
  let lastStartHeartbeatAt = 0;
  const progressEverySeconds = config.progressEverySeconds || 2;
  while (!startSettled) {
    await sleep(250);
    const state = readUi(document);
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    if (elapsedSeconds - lastStartHeartbeatAt >= progressEverySeconds) {
      lastStartHeartbeatAt = elapsedSeconds;
      emit(progressEvent(config, startedAt, state, readRawRows(sandbox), [], "initializing", sandbox));
    }
  }
  await startPromise;
  if (startError) throw startError;
  emit({ type: "started", id: config.id, ...readUi(document) });

  let lastHeartbeatAt = 0;
  let lastEmittedRawCount = 0;
  const timeoutMs = (config.timeoutSeconds || 21600) * 1000;
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(250);
    const state = readUi(document);
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    const rawRows = readRawRows(sandbox);
    if (rawRows.length > lastEmittedRawCount) {
      const newRawRows = rawRows.slice(lastEmittedRawCount);
      lastEmittedRawCount = rawRows.length;
      emit(progressEvent(config, startedAt, state, rawRows, newRawRows, "new_rows", sandbox));
    } else if (elapsedSeconds - lastHeartbeatAt >= progressEverySeconds) {
      lastHeartbeatAt = elapsedSeconds;
      emit(progressEvent(config, startedAt, state, rawRows, [], "heartbeat", sandbox));
    }
    if (state.notice.includes("Симуляция дошла до конца") || state.notice.includes("Симуляция дошла до даты конца")) {
      emit({
        type: "result",
        id: config.id,
        status: "completed",
        elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
        rows: state.rowCount,
        notice: state.notice,
        lastRow: state.lastRow,
        currentValue: state.currentValue,
        currentReward: state.currentReward,
        rawRows: readRawRows(sandbox),
        dataQuality: readDataQuality(sandbox),
      });
      return { exitCode: 0 };
    }
    if (state.notice.includes("Симуляция остановлена")) {
      emit({
        type: "result",
        id: config.id,
        status: "stopped",
        elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
        rows: state.rowCount,
        notice: state.notice,
        lastRow: state.lastRow,
        currentValue: state.currentValue,
        currentReward: state.currentReward,
        rawRows: readRawRows(sandbox),
        dataQuality: readDataQuality(sandbox),
      });
      return { exitCode: 2 };
    }
  }

  const state = readUi(document);
  emit({
    type: "result",
    id: config.id,
    status: "timeout",
    elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    rows: state.rowCount,
    notice: state.notice,
    lastRow: state.lastRow,
  });
  return { exitCode: 3 };
}

module.exports = {
  runSimulation,
};
