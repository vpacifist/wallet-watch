const { chromium } = require("playwright");

const config = JSON.parse(process.env.SERVER_SIM_CONFIG || "{}");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readState(page) {
  return await page.evaluate(() => {
    const notice = document.getElementById("simNotice")?.innerText || "";
    const rows = Array.from(document.querySelectorAll("#simTableBody tr"));
    const lastRow = rows.length ? rows[rows.length - 1].innerText : "";
    const button = document.getElementById("runSimulation")?.innerText || "";
    const currentValue = document.getElementById("currentPositionValue")?.innerText || "";
    const currentAero = document.getElementById("currentAeroEarned")?.innerText || "";
    return { notice, rowCount: rows.length, lastRow, button, currentValue, currentAero };
  });
}

function emit(payload) {
  console.log(JSON.stringify(payload));
}

function isCompleted(state) {
  return state.notice.includes("Симуляция дошла до даты конца");
}

function isStopped(state) {
  return state.notice.includes("Симуляция остановлена");
}

function isTransientRpcStop(state) {
  return [
    "All RPCs are unreachable",
    "Too Many Requests",
    "NetworkError",
    "timeout",
    "fetch",
    "429",
    "502",
    "503",
    "504",
  ].some((needle) => state.notice.includes(needle));
}

(async () => {
  if (!config.url || !config.start || !config.end) {
    emit({ type: "result", status: "error", message: "SERVER_SIM_CONFIG requires url, start, and end" });
    process.exit(4);
  }

  const browser = await chromium.launch({ headless: !config.headed });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const startedAt = Date.now();
  try {
    await page.goto(config.url, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => {
      const status = document.getElementById("status")?.textContent || "";
      const start = document.getElementById("simStartInput")?.value || "";
      const end = document.getElementById("simEndInput")?.value || "";
      return status.includes("CSV") && start.length >= 16 && end.length >= 16;
    }, { timeout: 60000 });

    await page.evaluate((nextConfig) => {
      const values = {
        simStartInput: nextConfig.start,
        simEndInput: nextConfig.end,
        depositInput: String(nextConfig.deposit || "10000"),
        rangePercentInput: String(nextConfig.rangePct || 1),
      };
      for (const [id, value] of Object.entries(values)) {
        const input = document.getElementById(id);
        if (!input) throw new Error(`Missing input #${id}`);
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, config);
    const appliedInputs = await page.evaluate(() => ({
      start: document.getElementById("simStartInput")?.value || "",
      end: document.getElementById("simEndInput")?.value || "",
      deposit: document.getElementById("depositInput")?.value || "",
      rangePct: document.getElementById("rangePercentInput")?.value || "",
    }));
    emit({ type: "inputs", id: config.id, ...appliedInputs });
    await page.evaluate(async () => {
      if (typeof startSimulation !== "function") throw new Error("startSimulation is not available");
      await startSimulation();
    });
    const startedState = await readState(page);
    emit({ type: "started", id: config.id, ...startedState });
    if (startedState.button === "START" && startedState.rowCount === 0) {
      throw new Error(`Simulation did not start: ${startedState.notice}`);
    }

    let lastProgressAt = 0;
    let retryAttempts = 0;
    let retryDelayMs = (config.retryInitialSeconds || 60) * 1000;
    let state = await readState(page);
    const timeoutMs = (config.timeoutSeconds || 21600) * 1000;

    while (Date.now() - startedAt < timeoutMs) {
      await sleep(1000);
      state = await readState(page);
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

      if (elapsedSeconds - lastProgressAt >= (config.progressEverySeconds || 10)) {
        lastProgressAt = elapsedSeconds;
        emit({
          type: "progress",
          id: config.id,
          elapsedSeconds,
          rows: state.rowCount,
          button: state.button,
          notice: state.notice,
          lastRow: state.lastRow,
          currentValue: state.currentValue,
          currentAero: state.currentAero,
        });
      }

      if (isCompleted(state)) {
        emit({
          type: "result",
          id: config.id,
          status: "completed",
          elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
          rows: state.rowCount,
          notice: state.notice,
          lastRow: state.lastRow,
          currentValue: state.currentValue,
          currentAero: state.currentAero,
        });
        await browser.close();
        process.exit(0);
      }

      if (isStopped(state) && isTransientRpcStop(state) && retryAttempts < (config.maxRetries || 1000)) {
        retryAttempts += 1;
        const waitSeconds = Math.round(retryDelayMs / 1000);
        emit({
          type: "retry_wait",
          id: config.id,
          attempt: retryAttempts,
          waitSeconds,
          elapsedSeconds,
          rows: state.rowCount,
          notice: state.notice,
          lastRow: state.lastRow,
        });
        await sleep(retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, (config.retryMaxSeconds || 300) * 1000);
        state = await readState(page);
        if (state.button.includes("RESUME") || state.button.includes("START")) {
          await page.locator("#runSimulation").click();
          emit({ type: "retry_resume", id: config.id, attempt: retryAttempts, rows: state.rowCount });
        }
      } else if (isStopped(state)) {
        emit({
          type: "result",
          id: config.id,
          status: "stopped",
          elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
          rows: state.rowCount,
          notice: state.notice,
          lastRow: state.lastRow,
        });
        await browser.close();
        process.exit(2);
      }
    }

    emit({
      type: "result",
      id: config.id,
      status: "timeout",
      elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      rows: state.rowCount,
      notice: state.notice,
      lastRow: state.lastRow,
    });
    await browser.close();
    process.exit(3);
  } catch (error) {
    emit({
      type: "result",
      id: config.id,
      status: "error",
      elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      message: error && error.message ? error.message : String(error),
    });
    await browser.close();
    process.exit(4);
  }
})();
