#!/usr/bin/env python3
import argparse
import ctypes
import json
import os
import socket
import subprocess
import sys
import tempfile
import textwrap
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MARKET_DATA = ROOT / "output" / "market_data.sqlite"
DEFAULT_URL = "http://127.0.0.1:8003/index.html"
ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001


def set_keep_awake(enabled):
    if os.name != "nt":
        return
    flags = ES_CONTINUOUS | (ES_SYSTEM_REQUIRED if enabled else 0)
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(flags)
    except Exception:
        pass


def is_port_open(host, port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex((host, port)) == 0


def stream_lines(prefix, pipe):
    for line in iter(pipe.readline, ""):
        print(f"{prefix}{line}", end="", flush=True)


def find_playwright_node_modules():
    roots = []
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        npx_root = Path(local_app_data) / "npm-cache" / "_npx"
        if npx_root.exists():
            roots.extend(sorted(npx_root.iterdir(), key=lambda path: path.stat().st_mtime, reverse=True))
    for root in roots:
        modules = root / "node_modules"
        if (modules / "playwright" / "index.js").exists():
            return modules
    return None


def ensure_playwright_node_modules():
    modules = find_playwright_node_modules()
    if modules:
        return modules
    print("Playwright is not in npm cache yet; running npx playwright --version...", flush=True)
    subprocess.run(["npx", "--yes", "playwright", "--version"], cwd=ROOT, check=True)
    modules = find_playwright_node_modules()
    if not modules:
        raise RuntimeError("Could not locate npm-cache node_modules with playwright")
    return modules


def write_driver_script():
    script = r"""
const { chromium } = require("playwright");

const config = JSON.parse(process.env.WARM_SIM_CONFIG);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function includesAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function isCompletedNotice(notice) {
  return includesAny(notice, [
    "Симуляция дошла до даты конца",
  ]);
}

function isStoppedNotice(notice) {
  return includesAny(notice, [
    "Симуляция остановлена",
  ]);
}

function isTransientRpcStop(notice) {
  return includesAny(notice, [
    "All RPCs are unreachable",
    "Too Many Requests",
    "NetworkError",
    "timeout",
    "fetch",
    "429",
    "502",
    "503",
    "504",
  ]);
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

(async () => {
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
    await page.locator("#simStartInput").fill(config.start);
    await page.locator("#simEndInput").fill(config.end);
    await page.locator("#depositInput").fill(String(config.deposit));
    await page.locator("#rangePercentInput").fill(String(config.rangePct));
    await page.locator("#runSimulation").click();

    let lastProgressAt = 0;
    let retryAttempts = 0;
    let retryDelayMs = config.retryInitialSeconds * 1000;
    let state = await readState(page);
    while (Date.now() - startedAt < config.timeoutSeconds * 1000) {
      await sleep(1000);
      state = await readState(page);
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
      if (elapsedSeconds - lastProgressAt >= config.progressEverySeconds) {
        lastProgressAt = elapsedSeconds;
        console.log(JSON.stringify({
          type: "progress",
          elapsedSeconds,
          rows: state.rowCount,
          button: state.button,
          notice: state.notice,
          lastRow: state.lastRow,
        }));
      }
      if (isCompletedNotice(state.notice)) {
        console.log(JSON.stringify({
          type: "result",
          status: "completed",
          elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
          rows: state.rowCount,
          notice: state.notice,
          lastRow: state.lastRow,
          currentValue: state.currentValue,
          currentAero: state.currentAero,
        }));
        await browser.close();
        process.exit(0);
      }
      if (isStoppedNotice(state.notice) && isTransientRpcStop(state.notice) && retryAttempts < config.maxRetries) {
        retryAttempts += 1;
        const waitSeconds = Math.round(retryDelayMs / 1000);
        console.log(JSON.stringify({
          type: "retry_wait",
          attempt: retryAttempts,
          maxRetries: config.maxRetries,
          waitSeconds,
          elapsedSeconds,
          rows: state.rowCount,
          notice: state.notice,
          lastRow: state.lastRow,
        }));
        await sleep(retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, config.retryMaxSeconds * 1000);
        state = await readState(page);
        if (state.button.includes("RESUME") || state.button.includes("START")) {
          await page.locator("#runSimulation").click();
          console.log(JSON.stringify({
            type: "retry_resume",
            attempt: retryAttempts,
            elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
            rows: state.rowCount,
            lastRow: state.lastRow,
          }));
          continue;
        }
      }
      if (isStoppedNotice(state.notice)) {
        console.log(JSON.stringify({
          type: "result",
          status: "stopped",
          elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
          rows: state.rowCount,
          notice: state.notice,
          lastRow: state.lastRow,
        }));
        await browser.close();
        process.exit(2);
      }
    }
    console.log(JSON.stringify({
      type: "result",
      status: "timeout",
      elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      rows: state.rowCount,
      notice: state.notice,
      lastRow: state.lastRow,
    }));
    await browser.close();
    process.exit(3);
  } catch (error) {
    console.log(JSON.stringify({
      type: "result",
      status: "error",
      elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      message: error && error.message ? error.message : String(error),
    }));
    await browser.close();
    process.exit(4);
  }
})();
"""
    temp_dir = ROOT / "output" / "warm-cache"
    temp_dir.mkdir(parents=True, exist_ok=True)
    path = temp_dir / "warm_driver.js"
    path.write_text(script, encoding="utf-8")
    return path


def parse_args():
    parser = argparse.ArgumentParser(description="Warm wallet-watch exact market-data cache through the real browser UI.")
    parser.add_argument("--start", required=True, help='Simulation start, e.g. "2026-02-02 00:00"')
    parser.add_argument("--end", required=True, help='Simulation end, e.g. "2026-02-02 01:00"')
    parser.add_argument("--range-pct", type=float, default=1.0, help="Range percent, e.g. 1, 2, ... 10")
    parser.add_argument("--deposit", default="10000", help="Deposit USDC value")
    parser.add_argument("--cache", dest="market_data", default=str(DEFAULT_MARKET_DATA), help="SQLite market-data cache path")
    parser.add_argument("--market-data", dest="market_data", help="SQLite market-data cache path")
    parser.add_argument("--url", default=DEFAULT_URL, help="App URL")
    parser.add_argument("--timeout-seconds", type=int, default=21600, help="Warm run timeout")
    parser.add_argument("--progress-every", type=int, default=10, help="Progress print interval in seconds")
    parser.add_argument("--max-retries", type=int, default=1000, help="Maximum transient RPC stop retries")
    parser.add_argument("--retry-initial-seconds", type=int, default=60, help="Initial wait before resuming after a transient RPC stop")
    parser.add_argument("--retry-max-seconds", type=int, default=300, help="Maximum wait before resuming after a transient RPC stop")
    parser.add_argument("--headed", action="store_true", help="Show the Playwright browser")
    parser.add_argument("--keep-proxy", action="store_true", help="Do not stop proxy started by this script")
    return parser.parse_args()


def main():
    args = parse_args()
    market_data_path = Path(args.market_data).resolve()
    market_data_path.parent.mkdir(parents=True, exist_ok=True)
    modules = ensure_playwright_node_modules()
    driver = write_driver_script()

    proxy = None
    proxy_started = False
    if not is_port_open("127.0.0.1", 8003):
        env = os.environ.copy()
        env["MARKET_DATA_PATH"] = str(market_data_path)
        proxy = subprocess.Popen(
            [sys.executable, str(ROOT / "scripts" / "serve_with_rpc.py")],
            cwd=ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        proxy_started = True
        threading.Thread(target=stream_lines, args=("[proxy] ", proxy.stderr), daemon=True).start()
        deadline = time.time() + 20
        while time.time() < deadline and not is_port_open("127.0.0.1", 8003):
            if proxy.poll() is not None:
                raise RuntimeError("RPC proxy exited before opening port 8003")
            time.sleep(0.25)
        if not is_port_open("127.0.0.1", 8003):
            raise RuntimeError("RPC proxy did not open port 8003")
    else:
        print("Using existing RPC proxy on 127.0.0.1:8003", flush=True)

    config = {
        "url": args.url,
        "start": args.start,
        "end": args.end,
        "rangePct": args.range_pct,
        "deposit": args.deposit,
        "timeoutSeconds": args.timeout_seconds,
        "progressEverySeconds": args.progress_every,
        "maxRetries": args.max_retries,
        "retryInitialSeconds": args.retry_initial_seconds,
        "retryMaxSeconds": args.retry_max_seconds,
        "headed": args.headed,
    }
    env = os.environ.copy()
    env["NODE_PATH"] = str(modules)
    env["WARM_SIM_CONFIG"] = json.dumps(config, ensure_ascii=False)

    set_keep_awake(True)
    try:
        print(
            f"Warm simulation cache: {args.start} -> {args.end}, "
            f"range={args.range_pct}%, deposit={args.deposit}, market_data={market_data_path}",
            flush=True,
        )
        completed = subprocess.run(
            ["node", str(driver)],
            cwd=ROOT,
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        return completed.returncode
    finally:
        set_keep_awake(False)
        if proxy_started and proxy and not args.keep_proxy and proxy.poll() is None:
            proxy.terminate()
            try:
                proxy.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proxy.kill()


if __name__ == "__main__":
    raise SystemExit(main())
