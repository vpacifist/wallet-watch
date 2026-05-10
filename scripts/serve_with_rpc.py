#!/usr/bin/env python3
import ctypes
import datetime
import http.server
import json
import os
import subprocess
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict, deque
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


ROOT = Path(__file__).resolve().parents[1]


def load_dotenv(path):
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ[key] = value
            masked = (value[:3] + "...") if len(value) > 3 else "***"
            print(f"Loaded from .env: {key}={masked}", file=sys.stderr, flush=True)


load_dotenv(ROOT / ".env")

DEFAULT_RPC_URLS = ["https://base.drpc.org", "https://base.gateway.tenderly.co", "https://mainnet.base.org", "https://base.llamarpc.com"]
RPC_URLS = [url.strip() for url in os.environ.get("BASE_RPC_URLS", "").split(",") if url.strip()] or DEFAULT_RPC_URLS
DATA_PATH = Path(os.environ.get("MARKET_DATA_PATH", ROOT / "output" / "market_data.sqlite"))
SIM_DATA_PATH = Path(os.environ.get("SIM_DATA_PATH", ROOT / "output" / "simulations.sqlite"))
SIM_WORKER_PATH = Path(os.environ.get("SIM_WORKER_PATH", ROOT / "scripts" / "node_sim_worker.js"))
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8003"))
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", f"http://127.0.0.1:{PORT}")
MAX_UPSTREAM_BATCH_SIZE = int(os.environ.get("MAX_UPSTREAM_BATCH_SIZE", "3"))
MAX_LOG_BLOCK_SPAN = int(os.environ.get("MAX_LOG_BLOCK_SPAN", "2000"))
MAX_EXACT_RESULT_BYTES = int(os.environ.get("MAX_EXACT_RESULT_BYTES", str(512 * 1024)))
DEBUG_RPC_ERRORS = os.environ.get("DEBUG_RPC_ERRORS", "").lower() in {"1", "true", "yes", "on"}
ADMIN_API_TOKEN = os.environ.get("ADMIN_API_TOKEN", "").strip()
MAX_RUNNING_SIMULATIONS = int(os.environ.get("MAX_RUNNING_SIMULATIONS", "1"))
MAX_SIMULATION_DAYS = float(os.environ.get("MAX_SIMULATION_DAYS", "31"))
RPC_RATE_LIMIT_PER_MINUTE = int(os.environ.get("RPC_RATE_LIMIT_PER_MINUTE", "300"))
API_RATE_LIMIT_PER_MINUTE = int(os.environ.get("API_RATE_LIMIT_PER_MINUTE", "60"))
SSE_RATE_LIMIT_PER_MINUTE = int(os.environ.get("SSE_RATE_LIMIT_PER_MINUTE", "180"))
SSE_HEARTBEAT_SECONDS = int(os.environ.get("SSE_HEARTBEAT_SECONDS", "20"))
SSE_MAX_CONNECTIONS_PER_IP = int(os.environ.get("SSE_MAX_CONNECTIONS_PER_IP", "6"))

AERO_USDC_POOL = "0xbe00ff35af70e8415d0eb605a286d8a45466a4c1"
AERO_PRICE_CACHE = {}
FINALITY_TAGS = {"latest", "pending", "safe", "finalized"}
DB_LOCK = threading.Lock()
SIM_LOCK = threading.Lock()
RUNNING_SIMULATIONS = {}
STATS_LOCK = threading.Lock()
RATE_LIMIT_LOCK = threading.Lock()
RATE_LIMITS = defaultdict(deque)
SSE_CONNECTIONS = defaultdict(int)
STATS = {
    "requests": 0,
    "cache_hits": 0,
    "cache_misses": 0,
    "log_range_hits": 0,
    "log_range_misses": 0,
    "upstream_batches": 0,
    "upstream_items": 0,
    "errors": 0,
    "started_at": time.time(),
    "last_log": 0.0,
}
ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001


def redact_url(url):
    parts = urlsplit(url)
    query = urlencode([
        (key, "..." if any(token in key.lower() for token in ["key", "token", "secret", "id"]) else value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
    ])
    path_parts = [part for part in parts.path.split("/") if part]
    redacted_path = parts.path
    if path_parts and len(path_parts[-1]) >= 16:
        redacted_path = "/" + "/".join([*path_parts[:-1], "..."])
    netloc = parts.hostname or ""
    if parts.port:
        netloc = f"{netloc}:{parts.port}"
    return urlunsplit((parts.scheme, netloc, redacted_path, query, ""))


class ApiError(Exception):
    def __init__(self, status, message, code=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code or "api_error"


@contextmanager
def sqlite_connection(path):
    db = sqlite3.connect(path)
    try:
        with db:
            yield db
    finally:
        db.close()


def init_cache():
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite_connection(DATA_PATH) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=NORMAL")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS blocks (
              number INTEGER PRIMARY KEY,
              tag TEXT UNIQUE NOT NULL,
              timestamp INTEGER NOT NULL,
              base_fee_per_gas TEXT,
              raw_json TEXT NOT NULL,
              created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS swap_logs (
              address TEXT NOT NULL,
              topic0 TEXT NOT NULL,
              block_number INTEGER NOT NULL,
              transaction_index INTEGER NOT NULL,
              log_index INTEGER NOT NULL,
              transaction_hash TEXT NOT NULL,
              raw_json TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              PRIMARY KEY (address, transaction_hash, log_index)
            );
            CREATE INDEX IF NOT EXISTS idx_swap_logs_range
              ON swap_logs(address, topic0, block_number, transaction_index, log_index);

            CREATE TABLE IF NOT EXISTS log_sync_ranges (
              address TEXT NOT NULL,
              topic0 TEXT NOT NULL,
              from_block INTEGER NOT NULL,
              to_block INTEGER NOT NULL,
              created_at INTEGER NOT NULL,
              PRIMARY KEY (address, topic0, from_block, to_block)
            );
            CREATE INDEX IF NOT EXISTS idx_log_sync_ranges_lookup
              ON log_sync_ranges(address, topic0, from_block, to_block);

            CREATE TABLE IF NOT EXISTS exact_rpc_cache (
              cache_key TEXT PRIMARY KEY,
              method TEXT NOT NULL,
              block_tag TEXT,
              result_json TEXT NOT NULL,
              result_bytes INTEGER NOT NULL,
              created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_exact_rpc_method
              ON exact_rpc_cache(method, block_tag);
            """
        )


def init_simulations():
    SIM_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite_connection(SIM_DATA_PATH) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=NORMAL")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS simulations (
              id TEXT PRIMARY KEY,
              status TEXT NOT NULL,
              params_json TEXT NOT NULL,
              progress_json TEXT,
              result_json TEXT,
              error TEXT,
              pid INTEGER,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              finished_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_simulations_created
              ON simulations(created_at DESC);
            """
        )


def now_int():
    return int(time.time())


def parse_simulation_time(value):
    normalized = str(value).strip().replace(" ", "T")
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    if len(normalized) == 16:
        normalized += ":00"
    parsed = datetime.datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed.astimezone(datetime.timezone.utc)


def active_running_simulations():
    with SIM_LOCK:
        stale = [simulation_id for simulation_id, process in RUNNING_SIMULATIONS.items() if process.poll() is not None]
        for simulation_id in stale:
            RUNNING_SIMULATIONS.pop(simulation_id, None)
        return len(RUNNING_SIMULATIONS)


def compact_simulation_payload(payload):
    if not isinstance(payload, dict):
        return payload
    compact = dict(payload)
    if "tableRows" in compact:
        compact["tableRowCount"] = len(compact.get("tableRows") or [])
        compact.pop("tableRows", None)
    if "rawRows" in compact:
        compact["rawRowCount"] = len(compact.get("rawRows") or [])
        compact.pop("rawRows", None)
    return compact


def simulation_row_to_dict(row, compact=False):
    if not row:
        return None
    columns = [
        "id",
        "status",
        "params_json",
        "progress_json",
        "result_json",
        "error",
        "pid",
        "created_at",
        "updated_at",
        "finished_at",
    ]
    item = dict(zip(columns, row))
    for key in ("params_json", "progress_json", "result_json"):
        payload = json.loads(item[key]) if item.get(key) else None
        if compact and key in {"progress_json", "result_json"}:
            payload = compact_simulation_payload(payload)
        item[key.replace("_json", "")] = payload
        item.pop(key, None)
    return item


def get_simulation(simulation_id):
    with SIM_LOCK, sqlite_connection(SIM_DATA_PATH) as db:
        row = db.execute(
            """
            SELECT id, status, params_json, progress_json, result_json, error, pid,
                   created_at, updated_at, finished_at
            FROM simulations
            WHERE id = ?
            """,
            (simulation_id,),
        ).fetchone()
    return simulation_row_to_dict(row)


def get_latest_simulation():
    with SIM_LOCK, sqlite_connection(SIM_DATA_PATH) as db:
        row = db.execute(
            """
            SELECT id, status, params_json, progress_json, result_json, error, pid,
                   created_at, updated_at, finished_at
            FROM simulations
            ORDER BY created_at DESC
            LIMIT 1
            """
        ).fetchone()
    return simulation_row_to_dict(row, compact=True)


def list_simulations(limit=20):
    limit = max(1, min(int(limit or 20), 1000))
    with SIM_LOCK, sqlite_connection(SIM_DATA_PATH) as db:
        rows = db.execute(
            """
            SELECT id, status, params_json, progress_json, result_json, error, pid,
                   created_at, updated_at, finished_at
            FROM simulations
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [simulation_row_to_dict(row, compact=True) for row in rows]


def update_simulation(simulation_id, **fields):
    if not fields:
        return
    allowed = {"status", "progress_json", "result_json", "error", "pid", "finished_at"}
    assignments = []
    values = []
    for key, value in fields.items():
        if key not in allowed:
            continue
        assignments.append(f"{key} = ?")
        values.append(value)
    assignments.append("updated_at = ?")
    values.append(now_int())
    values.append(simulation_id)
    with SIM_LOCK, sqlite_connection(SIM_DATA_PATH) as db:
        db.execute(f"UPDATE simulations SET {', '.join(assignments)} WHERE id = ?", values)


def insert_simulation(simulation_id, params):
    timestamp = now_int()
    with SIM_LOCK, sqlite_connection(SIM_DATA_PATH) as db:
        db.execute(
            """
            INSERT INTO simulations (id, status, params_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (simulation_id, "queued", json.dumps(params, ensure_ascii=False), timestamp, timestamp),
        )


def delete_simulation(simulation_id):
    with SIM_LOCK, sqlite_connection(SIM_DATA_PATH) as db:
        cursor = db.execute("DELETE FROM simulations WHERE id = ?", (simulation_id,))
        return cursor.rowcount > 0


def normalize_simulation_params(payload):
    start = str(payload.get("start", "")).strip()
    end = str(payload.get("end", "")).strip()
    if len(start) < 16 or len(end) < 16:
        raise ApiError(400, "start and end are required", "invalid_simulation_period")
    try:
        start_time = parse_simulation_time(start)
        end_time = parse_simulation_time(end)
    except ValueError as exc:
        raise ApiError(400, f"invalid simulation date: {exc}", "invalid_simulation_period")
    if end_time <= start_time:
        raise ApiError(400, "end must be after start", "invalid_simulation_period")
    days = (end_time - start_time).total_seconds() / (24 * 60 * 60)
    if days > MAX_SIMULATION_DAYS:
        raise ApiError(
            400,
            f"simulation period is limited to {MAX_SIMULATION_DAYS:g} days",
            "simulation_period_too_long",
        )
    deposit = str(payload.get("deposit", "10000")).strip() or "10000"
    range_pct = float(payload.get("rangePct", payload.get("range_pct", 1)))
    if range_pct <= 0 or range_pct >= 100:
        raise ApiError(400, "rangePct must be greater than 0 and less than 100", "invalid_range_pct")
    lp_mode = str(payload.get("lpMode", payload.get("lp_mode", "staked"))).strip().lower() or "staked"
    if lp_mode not in {"staked", "unstaked"}:
        raise ApiError(400, "lpMode must be 'staked' or 'unstaked'", "invalid_lp_mode")
    timeout_seconds = int(payload.get("timeoutSeconds", 21600))
    return {
        "start": start,
        "end": end,
        "deposit": deposit,
        "rangePct": range_pct,
        "lpMode": lp_mode,
        "timeoutSeconds": timeout_seconds,
        "progressEverySeconds": int(payload.get("progressEverySeconds", 2)),
        "rebalanceManualFeeBps": float(payload.get("rebalanceManualFeeBps", os.environ.get("REBALANCE_MANUAL_FEE_BPS", "1"))),
        "rebalanceGasUnits": int(payload.get("rebalanceGasUnits", os.environ.get("REBALANCE_GAS_UNITS", "1450000"))),
        "rebalanceL1DataFeeEth": float(payload.get("rebalanceL1DataFeeEth", os.environ.get("REBALANCE_L1_DATA_FEE_ETH", "0.000012"))),
        "rebalanceFallbackSlippageBps": float(payload.get("rebalanceFallbackSlippageBps", os.environ.get("REBALANCE_FALLBACK_SLIPPAGE_BPS", "5"))),
        "aeroImpactHaircutMax": float(payload.get("aeroImpactHaircutMax", os.environ.get("AERO_IMPACT_HAIRCUT_MAX", "0.5"))),
        "serverSimulationPollMs": int(payload.get("serverSimulationPollMs", os.environ.get("SERVER_SIMULATION_POLL_MS", "2500"))),
        "lpFeeRate": float(payload.get("lpFeeRate", os.environ.get("LP_FEE_RATE", "0.0005"))),
    }


def progress_row_key(row):
    if not isinstance(row, dict):
        return json.dumps(row, sort_keys=True, ensure_ascii=False)
    return ":".join(str(row.get(key, "")) for key in ("index", "blockNumber", "event"))


def merge_simulation_progress(simulation_id, event):
    current = get_simulation(simulation_id) or {}
    previous = current.get("progress") if isinstance(current.get("progress"), dict) else {}
    merged = dict(event)
    existing_rows = previous.get("rawRows") if isinstance(previous, dict) else []
    rows_by_key = {}
    if isinstance(existing_rows, list):
        for row in existing_rows:
            rows_by_key[progress_row_key(row)] = row
    for key in ("rawRows", "newRawRows"):
        rows = event.get(key)
        if isinstance(rows, list):
            for row in rows:
                rows_by_key[progress_row_key(row)] = row
    raw_rows = sorted(
        rows_by_key.values(),
        key=lambda row: row.get("index", 0) if isinstance(row, dict) else 0,
    )
    if raw_rows:
        merged["rawRows"] = raw_rows
        merged["rawRowCount"] = len(raw_rows)
        merged["latestRawRow"] = event.get("latestRawRow") or raw_rows[-1]
        merged["rows"] = max(int(event.get("rows") or 0), len(raw_rows))
    return merged


def stream_simulation_stdout(simulation_id, pipe):
    for line in iter(pipe.readline, ""):
        text = line.strip()
        if not text:
            continue
        try:
            event = json.loads(text)
        except json.JSONDecodeError:
            update_simulation(simulation_id, progress_json=json.dumps({"message": text}, ensure_ascii=False))
            continue
        event_type = event.get("type")
        if event_type == "result":
            status = event.get("status") or "finished"
            terminal = "completed" if status == "completed" else status
            update_simulation(
                simulation_id,
                status=terminal,
                result_json=json.dumps(event, ensure_ascii=False),
                progress_json=json.dumps(event, ensure_ascii=False),
                finished_at=now_int(),
            )
        else:
            progress = merge_simulation_progress(simulation_id, event)
            update_simulation(simulation_id, status="running", progress_json=json.dumps(progress, ensure_ascii=False))


def stream_simulation_stderr(simulation_id, pipe):
    for line in iter(pipe.readline, ""):
        text = line.strip()
        if text:
            update_simulation(simulation_id, progress_json=json.dumps({"type": "log", "message": text}, ensure_ascii=False))


def wait_for_simulation(simulation_id, process):
    code = process.wait()
    with SIM_LOCK:
        RUNNING_SIMULATIONS.pop(simulation_id, None)
    current = get_simulation(simulation_id)
    if current and current["status"] in {"queued", "running"}:
        status = "completed" if code == 0 else "failed"
        update_simulation(
            simulation_id,
            status=status,
            error=None if code == 0 else f"simulation process exited with code {code}",
            finished_at=now_int(),
        )


def start_simulation_job(params):
    running = active_running_simulations()
    if running >= MAX_RUNNING_SIMULATIONS:
        raise ApiError(
            409,
            f"simulation limit reached: {running} running, max {MAX_RUNNING_SIMULATIONS}",
            "simulation_limit_reached",
        )
    simulation_id = uuid.uuid4().hex
    insert_simulation(simulation_id, params)
    config = {
        "id": simulation_id,
        "url": f"{PUBLIC_BASE_URL.rstrip('/')}/index.html",
        **params,
        "headed": False,
        "retryInitialSeconds": 60,
        "retryMaxSeconds": 300,
        "maxRetries": 1000,
        "timeoutSeconds": 86400,
    }
    env = os.environ.copy()
    env["SERVER_SIM_CONFIG"] = json.dumps(config, ensure_ascii=False)
    process = subprocess.Popen(
        ["node", str(SIM_WORKER_PATH)],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    update_simulation(
        simulation_id,
        status="running",
        pid=process.pid,
        progress_json=json.dumps({
            "type": "started",
            "elapsedSeconds": 0,
            "rows": 0,
            "notice": "server worker started; opening local simulation page",
        }, ensure_ascii=False),
    )
    with SIM_LOCK:
        RUNNING_SIMULATIONS[simulation_id] = process
    threading.Thread(target=stream_simulation_stdout, args=(simulation_id, process.stdout), daemon=True).start()
    threading.Thread(target=stream_simulation_stderr, args=(simulation_id, process.stderr), daemon=True).start()
    threading.Thread(target=wait_for_simulation, args=(simulation_id, process), daemon=True).start()
    return get_simulation(simulation_id)


def cancel_simulation_job(simulation_id):
    simulation = get_simulation(simulation_id)
    if not simulation:
        return None
    if simulation["status"] not in {"queued", "running"}:
        return simulation

    with SIM_LOCK:
        process = RUNNING_SIMULATIONS.get(simulation_id)
    if process and process.poll() is None:
        process.terminate()

    update_simulation(
        simulation_id,
        status="cancelled",
        error="cancelled by user",
        finished_at=now_int(),
    )
    return get_simulation(simulation_id)


def set_keep_awake(enabled):
    if os.name != "nt":
        return
    flags = ES_CONTINUOUS | (ES_SYSTEM_REQUIRED if enabled else 0)
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(flags)
    except Exception:
        pass


def record_stat(name, amount=1):
    with STATS_LOCK:
        STATS[name] += amount


def maybe_log_progress(force=False):
    now = time.time()
    with STATS_LOCK:
        if not force and now - STATS["last_log"] < 10:
            return
        STATS["last_log"] = now
        elapsed = max(1, now - STATS["started_at"])
        total = STATS["cache_hits"] + STATS["cache_misses"]
        hit_rate = STATS["cache_hits"] / total * 100 if total else 0
        message = (
            f"[{time.strftime('%H:%M:%S')}] RPC proxy "
            f"requests={STATS['requests']} cache_hits={STATS['cache_hits']} "
            f"cache_misses={STATS['cache_misses']} hit_rate={hit_rate:.1f}% "
            f"log_range_hits={STATS['log_range_hits']} log_range_misses={STATS['log_range_misses']} "
            f"upstream_batches={STATS['upstream_batches']} upstream_items={STATS['upstream_items']} "
            f"errors={STATS['errors']} avg_items_per_sec={STATS['upstream_items'] / elapsed:.1f}"
        )
    print(message, file=sys.stderr, flush=True)


def hex_to_int(value):
    return int(value, 16)


def int_to_block_tag(value):
    return hex(int(value))


def cache_key(payload):
    canonical = {
        "method": payload.get("method"),
        "params": payload.get("params", []),
    }
    return json.dumps(canonical, sort_keys=True, separators=(",", ":"))


def block_tag_from_params(params):
    if not params:
        return None
    if len(params) > 1 and isinstance(params[-1], str):
        return params[-1]
    first = params[0]
    if isinstance(first, dict):
        from_block = first.get("fromBlock")
        to_block = first.get("toBlock")
        if from_block or to_block:
            return f"{from_block or ''}:{to_block or ''}"
    return None


def is_historical_block_tag(tag):
    return isinstance(tag, str) and tag not in FINALITY_TAGS


def exact_cacheable(payload):
    method = payload.get("method")
    params = payload.get("params", [])
    if method == "eth_getBlockByNumber":
        return bool(params) and is_historical_block_tag(params[0])
    if method == "eth_call":
        return len(params) > 1 and is_historical_block_tag(params[-1])
    return False


def parse_supported_logs_filter(payload):
    if payload.get("method") != "eth_getLogs":
        return None
    params = payload.get("params", [])
    if len(params) != 1 or not isinstance(params[0], dict):
        return None
    flt = params[0]
    address = flt.get("address")
    topics = flt.get("topics") or []
    from_block = flt.get("fromBlock")
    to_block = flt.get("toBlock")
    if isinstance(address, list) or not isinstance(address, str):
        return None
    if not topics or not isinstance(topics[0], str):
        return None
    if len(topics) > 1 and any(topic not in (None, []) for topic in topics[1:]):
        return None
    if not (is_historical_block_tag(from_block) and is_historical_block_tag(to_block)):
        return None
    from_int = hex_to_int(from_block)
    to_int = hex_to_int(to_block)
    if to_int < from_int:
        return None
    return {
        "address": address.lower(),
        "topic0": topics[0].lower(),
        "from_block": from_int,
        "to_block": to_int,
    }


def covered_by_ranges(db, address, topic0, from_block, to_block):
    rows = db.execute(
        """
        SELECT from_block, to_block
        FROM log_sync_ranges
        WHERE address = ? AND topic0 = ? AND to_block >= ? AND from_block <= ?
        ORDER BY from_block
        """,
        (address, topic0, from_block, to_block),
    ).fetchall()
    cursor = from_block
    for start, end in rows:
        if start > cursor:
            return False
        if end >= cursor:
            cursor = end + 1
        if cursor > to_block:
            return True
    return False


def cached_log_result(info):
    with DB_LOCK, sqlite_connection(DATA_PATH) as db:
        if not covered_by_ranges(db, info["address"], info["topic0"], info["from_block"], info["to_block"]):
            return None
        rows = db.execute(
            """
            SELECT raw_json
            FROM swap_logs
            WHERE address = ? AND topic0 = ? AND block_number BETWEEN ? AND ?
            ORDER BY block_number, transaction_index, log_index
            """,
            (info["address"], info["topic0"], info["from_block"], info["to_block"]),
        ).fetchall()
    return [json.loads(row[0]) for row in rows]


def cached_exact_result(key, payload):
    method = payload.get("method")
    params = payload.get("params", [])
    with DB_LOCK, sqlite_connection(DATA_PATH) as db:
        if method == "eth_getBlockByNumber" and params:
            row = db.execute("SELECT raw_json FROM blocks WHERE tag = ?", (params[0].lower(),)).fetchone()
            if row:
                return json.loads(row[0])
        row = db.execute("SELECT result_json FROM exact_rpc_cache WHERE cache_key = ?", (key,)).fetchone()
    if not row:
        return None
    return json.loads(row[0])


def store_block(db, payload, result):
    params = payload.get("params", [])
    if not params or not isinstance(result, dict) or "number" not in result:
        return
    tag = params[0].lower()
    number = hex_to_int(result["number"])
    timestamp = hex_to_int(result.get("timestamp", "0x0"))
    raw = json.dumps(result, separators=(",", ":"))
    db.execute(
        """
        INSERT OR REPLACE INTO blocks (number, tag, timestamp, base_fee_per_gas, raw_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (number, tag, timestamp, result.get("baseFeePerGas"), raw, int(time.time())),
    )


def store_logs(db, info, logs):
    now = int(time.time())
    for log in logs or []:
        try:
            topics = log.get("topics") or []
            topic0 = (topics[0] if topics else info["topic0"]).lower()
            address = log.get("address", info["address"]).lower()
            db.execute(
                """
                INSERT OR REPLACE INTO swap_logs
                  (address, topic0, block_number, transaction_index, log_index, transaction_hash, raw_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    address,
                    topic0,
                    hex_to_int(log["blockNumber"]),
                    hex_to_int(log.get("transactionIndex", "0x0")),
                    hex_to_int(log["logIndex"]),
                    log["transactionHash"].lower(),
                    json.dumps(log, separators=(",", ":")),
                    now,
                ),
            )
        except Exception as exc:
            print(f"Skipping malformed log: {exc}", file=sys.stderr, flush=True)
    db.execute(
        """
        INSERT OR IGNORE INTO log_sync_ranges (address, topic0, from_block, to_block, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (info["address"], info["topic0"], info["from_block"], info["to_block"], now),
    )


def store_exact_result(key, payload, result):
    result_json = json.dumps(result, separators=(",", ":"))
    result_bytes = len(result_json.encode("utf-8"))
    with DB_LOCK, sqlite_connection(DATA_PATH) as db:
        if payload.get("method") == "eth_getBlockByNumber":
            store_block(db, payload, result)
        if result_bytes <= MAX_EXACT_RESULT_BYTES:
            db.execute(
                """
                INSERT OR REPLACE INTO exact_rpc_cache
                  (cache_key, method, block_tag, result_json, result_bytes, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    key,
                    payload.get("method", ""),
                    block_tag_from_params(payload.get("params", [])),
                    result_json,
                    result_bytes,
                    int(time.time()),
                ),
            )


def store_log_result(info, logs):
    with DB_LOCK, sqlite_connection(DATA_PATH) as db:
        store_logs(db, info, logs)


def response_from_result(payload, result):
    return {"jsonrpc": "2.0", "id": payload.get("id"), "result": result}


def response_from_error(payload, error):
    return {"jsonrpc": "2.0", "id": payload.get("id"), "error": error or {"message": "RPC proxy error"}}


def try_one_provider(url, body, summary):
    try:
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "User-Agent": "wallet-watch/1.0"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            preview = raw[:240].decode("utf-8", errors="replace")
            return False, {
                "message": f"Invalid JSON from RPC provider: {exc.msg}",
                "position": exc.pos,
                "responseBytes": len(raw),
                "preview": preview,
            }
        
        responses = parsed if isinstance(parsed, list) else [parsed]
        if all("error" not in item for item in responses):
            return True, parsed
        
        last_error = next((item["error"] for item in responses if "error" in item), None)
        return False, last_error
    except urllib.error.HTTPError as exc:
        try:
            body_text = exc.read().decode("utf-8", errors="replace")
        except:
            body_text = "unreadable body"
        return False, {"code": exc.code, "message": body_text}
    except (urllib.error.URLError, TimeoutError) as exc:
        return False, {"message": str(exc)}


def upstream_post(payload):
    body = json.dumps(payload).encode("utf-8")
    last_error = None
    payloads = payload if isinstance(payload, list) else [payload]
    summary = ", ".join(item.get("method", "<unknown>") for item in payloads[:8])
    if len(payloads) > 8:
        summary += f", ... +{len(payloads) - 8}"
    
    attempted_errors = []
    # Try providers one by one first to save limits
    for url in RPC_URLS:
        success, result = try_one_provider(url, body, summary)
        if success:
            return result
        last_error = result
        attempted_errors.append((url, last_error))

    # If all failed once, use parallelism for retries to find a working one fast
    with ThreadPoolExecutor(max_workers=min(len(RPC_URLS), 8)) as executor:
        for attempt in range(3):
            futures = {executor.submit(try_one_provider, url, body, summary): url for url in RPC_URLS}
            for future in as_completed(futures):
                url = futures[future]
                try:
                    success, result = future.result()
                    if success:
                        return result
                    
                    last_error = result
                    attempted_errors.append((url, last_error))
                    
                    # Detailed logging for specific error types
                    err_msg = str(last_error.get("message", "")) if isinstance(last_error, dict) else str(last_error)
                    is_plan_error = any(token in err_msg.lower() for token in ["plan", "archive", "limit", "allowance", "method not allowed", "debug", "trace"])
                    
                    if is_plan_error:
                        print(f"\n!!! PLAN LIMIT DETECTED !!!", file=sys.stderr, flush=True)
                        print(f"Provider: {redact_url(url)}", file=sys.stderr, flush=True)
                        print(f"Methods: [{summary}]", file=sys.stderr, flush=True)
                        print(f"Error: {err_msg}", file=sys.stderr, flush=True)
                        print(f"Action: Consider upgrading plan or reducing request range.\n", file=sys.stderr, flush=True)
                    elif DEBUG_RPC_ERRORS:
                        print(f"RPC error from {redact_url(url)} for [{summary}]: {last_error}", file=sys.stderr, flush=True)
                except Exception as exc:
                    last_error = {"message": str(exc)}
                    attempted_errors.append((url, last_error))
                    print(f"[{time.strftime('%H:%M:%S')}] RPC Exception from {redact_url(url)}: {exc}", file=sys.stderr, flush=True)
            
            if attempt < 2:
                time.sleep(2.0 * (attempt + 1))
    
    if attempted_errors:
        providers = ", ".join(redact_url(url) for url, _ in attempted_errors[-len(RPC_URLS):])
        print(f"RPC upstream failed for [{summary}] after parallel retries; last providers: {providers}; last_error={last_error}", file=sys.stderr, flush=True)
    raise RuntimeError(json.dumps(last_error or {"message": "RPC proxy error"}))


def fetch_logs_in_chunks(payload, info):
    all_logs_by_key = {}
    current = info["from_block"]
    while current <= info["to_block"]:
        end = min(info["to_block"], current + MAX_LOG_BLOCK_SPAN - 1)
        chunk_payload = json.loads(json.dumps(payload))
        chunk_payload["params"][0]["fromBlock"] = int_to_block_tag(current)
        chunk_payload["params"][0]["toBlock"] = int_to_block_tag(end)
        parsed = upstream_post(chunk_payload)
        if isinstance(parsed, list):
            item = parsed[0] if parsed else {}
            if "error" in item:
                raise RuntimeError(json.dumps(item["error"]))
            logs = item.get("result", [])
        else:
            if "error" in parsed:
                raise RuntimeError(json.dumps(parsed["error"]))
            logs = parsed.get("result", [])
        chunk_info = dict(info, from_block=current, to_block=end)
        store_log_result(chunk_info, logs)
        for log in logs or []:
            key = (
                hex_to_int(log.get("blockNumber", "0x0")),
                hex_to_int(log.get("transactionIndex", "0x0")),
                hex_to_int(log.get("logIndex", "0x0")),
                (log.get("transactionHash") or "").lower(),
            )
            all_logs_by_key[key] = log
        current = end + 1
    return sorted(
        all_logs_by_key.values(),
        key=lambda log: (
            hex_to_int(log.get("blockNumber", "0x0")),
            hex_to_int(log.get("transactionIndex", "0x0")),
            hex_to_int(log.get("logIndex", "0x0")),
        ),
    )


def classify_payload(payload):
    log_info = parse_supported_logs_filter(payload)
    if log_info:
        return "logs", log_info, None
    if exact_cacheable(payload):
        key = cache_key(payload)
        return "exact", None, key
    return "live", None, None


def post_rpc_batch(payloads):
    record_stat("requests")
    results = [None] * len(payloads)
    misses = []

    for index, payload in enumerate(payloads):
        kind, log_info, key = classify_payload(payload)
        if kind == "logs":
            result = cached_log_result(log_info)
            if result is None:
                record_stat("cache_misses")
                record_stat("log_range_misses")
                misses.append((index, kind, log_info, None, payload))
            else:
                record_stat("cache_hits")
                record_stat("log_range_hits")
                results[index] = response_from_result(payload, result)
        elif kind == "exact":
            result = cached_exact_result(key, payload)
            if result is None:
                record_stat("cache_misses")
                misses.append((index, kind, None, key, payload))
            else:
                record_stat("cache_hits")
                results[index] = response_from_result(payload, result)
        else:
            misses.append((index, kind, None, None, payload))

    if misses:
        deferred_misses = []
        for index, kind, log_info, key, payload in misses:
            if kind == "logs" and log_info and (log_info["to_block"] - log_info["from_block"] + 1) > MAX_LOG_BLOCK_SPAN:
                try:
                    result = fetch_logs_in_chunks(payload, log_info)
                    results[index] = response_from_result(payload, result)
                    record_stat("upstream_items", len(result))
                except RuntimeError as exc:
                    record_stat("errors")
                    try:
                        error = json.loads(str(exc))
                    except json.JSONDecodeError:
                        error = {"message": str(exc)}
                    results[index] = response_from_error(payload, error)
            else:
                deferred_misses.append((index, kind, log_info, key, payload))
        misses = deferred_misses

    if misses:
        upstream_payload = []
        for upstream_id, (_, _, _, _, payload) in enumerate(misses, start=1):
            item = dict(payload)
            item["jsonrpc"] = "2.0"
            item["id"] = upstream_id
            upstream_payload.append(item)
        for offset in range(0, len(upstream_payload), MAX_UPSTREAM_BATCH_SIZE):
            chunk = upstream_payload[offset:offset + MAX_UPSTREAM_BATCH_SIZE]
            chunk_misses = misses[offset:offset + MAX_UPSTREAM_BATCH_SIZE]
            try:
                parsed = upstream_post(chunk[0] if len(chunk) == 1 else chunk)
                upstream_responses = parsed if isinstance(parsed, list) else [parsed]
                by_id = {item.get("id"): item for item in upstream_responses}
                record_stat("upstream_batches")
                record_stat("upstream_items", len(chunk))
                for upstream_id, (index, kind, log_info, key, payload) in zip([item["id"] for item in chunk], chunk_misses):
                    item = by_id.get(upstream_id)
                    if not item:
                        results[index] = response_from_error(payload, {"message": "missing RPC batch response"})
                    elif "error" in item:
                        results[index] = response_from_error(payload, item["error"])
                    else:
                        result = item.get("result")
                        if kind == "logs" and log_info is not None:
                            store_log_result(log_info, result)
                        elif kind == "exact" and key is not None:
                            store_exact_result(key, payload, result)
                        results[index] = response_from_result(payload, result)
            except RuntimeError as exc:
                record_stat("errors")
                try:
                    error = json.loads(str(exc))
                except json.JSONDecodeError:
                    error = {"message": str(exc)}
                for index, _, _, _, payload in chunk_misses:
                    results[index] = response_from_error(payload, error)

    maybe_log_progress()
    return results


def post_rpc(payload):
    return post_rpc_batch([payload])[0]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def client_ip(self):
        forwarded = self.headers.get("X-Forwarded-For", "").split(",", 1)[0].strip()
        return forwarded or self.client_address[0]

    def check_rate_limit(self, bucket, limit):
        if limit <= 0:
            return True
        client_ip = self.client_ip()
        if client_ip in {"127.0.0.1", "::1", "localhost"}:
            return True
        now = time.time()
        key = (bucket, client_ip)
        with RATE_LIMIT_LOCK:
            hits = RATE_LIMITS[key]
            while hits and now - hits[0] >= 60:
                hits.popleft()
            if len(hits) >= limit:
                retry_after = max(1, int(60 - (now - hits[0])))
                self.send_json(
                    429,
                    {
                        "error": f"rate limit exceeded for {bucket}",
                        "code": "rate_limit_exceeded",
                        "retryAfterSeconds": retry_after,
                    },
                )
                return False
            hits.append(now)
        return True

    def check_api_rate_limit(self):
        return self.check_rate_limit("api", API_RATE_LIMIT_PER_MINUTE)
    def check_sse_rate_limit(self):
        return self.check_rate_limit("sse", SSE_RATE_LIMIT_PER_MINUTE)

    def check_rpc_rate_limit(self):
        return self.check_rate_limit("rpc", RPC_RATE_LIMIT_PER_MINUTE)

    def do_POST(self):
        print(f"[{time.strftime('%H:%M:%S')}] POST {self.path}", file=sys.stderr, flush=True)
        parsed = urllib.parse.urlparse(getattr(self, "path", ""))
        if parsed.path == "/api/simulations":
            if not self.check_api_rate_limit():
                return
            if not self.require_admin_token():
                return
            try:
                length = int(self.headers.get("content-length", "0"))
                body = self.rfile.read(length)
                payload = json.loads(body or b"{}")
                params = normalize_simulation_params(payload)
                result = start_simulation_job(params)
                self.send_json(202, result)
            except ApiError as exc:
                self.send_json(exc.status, {"error": exc.message, "code": exc.code})
            except Exception as exc:
                self.send_json(400, {"error": str(exc)})
            return

        if parsed.path.startswith("/api/simulations/") and parsed.path.endswith("/cancel"):
            if not self.check_api_rate_limit():
                return
            if not self.require_admin_token():
                return
            simulation_id = parsed.path.split("/")[-2]
            result = cancel_simulation_job(simulation_id)
            if not result:
                self.send_json(404, {"error": "simulation not found"})
            else:
                self.send_json(200, result)
            return

        if self.path != "/rpc":
            self.send_error(404)
            return
        if not self.check_rpc_rate_limit():
            return

        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length)
        payload = json.loads(body)
        result = post_rpc_batch(payload) if isinstance(payload, list) else post_rpc(payload)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode("utf-8"))

    def send_json(self, status, payload):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    def require_admin_token(self):
        if not ADMIN_API_TOKEN:
            return True
        # Using self.path directly as it contains the full request path including query
        path_str = getattr(self, "path", "")
        if "?" in path_str:
            _, query = path_str.split("?", 1)
        else:
            query = ""
        params = urllib.parse.parse_qs(query)

        # Extract tokens from various sources, stripping whitespace and optional quotes
        # Also handle potential double encoding from some proxies
        raw_query_token = params.get("admin_token", [""])[0].strip().strip('"').strip("'")
        query_token = urllib.parse.unquote(raw_query_token) if "%" in raw_query_token else raw_query_token
        
        header_token = self.headers.get("X-Admin-API-Token", "").strip().strip('"').strip("'")
        auth = self.headers.get("Authorization", "").strip()
        bearer = auth[7:].strip().strip('"').strip("'") if auth.lower().startswith("bearer ") else ""

        # Ensure tokens are clean for comparison
        target = (ADMIN_API_TOKEN or "").strip().strip('"').strip("'")
        
        if header_token == target or bearer == target or query_token == target:
            return True

        # Log failed attempt for debugging (without revealing the full token)
        client_ip = self.client_ip()
        masked_query = (query_token[:3] + "...") if len(query_token) > 3 else ("***" if query_token else "none")
        expected_len = len(target)
        received_len = len(query_token)
        print(f"[{time.strftime('%H:%M:%S')}] 401 Unauthorized: {client_ip} {self.command} {path_str} (query_token={masked_query}, len_expected={expected_len}, len_received={received_len})", file=sys.stderr, flush=True)

        self.send_json(401, {"error": "admin token required", "code": "unauthorized"})
        return False

    def do_GET(self):
        print(f"[{time.strftime('%H:%M:%S')}] GET {self.path}", file=sys.stderr, flush=True)
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/health":
            self.send_json(200, {"ok": True, "status": "healthy", "time": now_int()})
            return
        if parsed.path.startswith("/api/simulations/") and parsed.path.endswith("/events"):
            if not self.check_sse_rate_limit():
                return
            if not self.require_admin_token():
                return
            simulation_id = parsed.path.split("/")[-2]
            self.handle_simulation_events(simulation_id)
            return
        if parsed.path == "/api/simulations":
            if not self.check_api_rate_limit():
                return
            params = urllib.parse.parse_qs(parsed.query)
            limit = params.get("limit", ["20"])[0]
            self.send_json(200, {"items": list_simulations(limit)})
            return
        if parsed.path == "/api/simulations/latest":
            if not self.check_api_rate_limit():
                return
            self.send_json(200, get_latest_simulation() or {})
            return
        if parsed.path.startswith("/api/simulations/"):
            if not self.check_api_rate_limit():
                return
            if not self.require_admin_token():
                return
            simulation_id = parsed.path.rsplit("/", 1)[-1]
            simulation = get_simulation(simulation_id)
            if not simulation:
                self.send_json(404, {"error": "simulation not found"})
            else:
                self.send_json(200, simulation)
            return
        if parsed.path == "/aero-price":
            params = urllib.parse.parse_qs(parsed.query)
            try:
                timestamp = int(params.get("timestamp", [""])[0])
                price = get_aero_price(timestamp)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(json.dumps(price).encode("utf-8"))
            except Exception as exc:
                self.send_response(502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(exc)}).encode("utf-8"))
            return
        super().do_GET()

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/simulations/"):
            if not self.check_api_rate_limit():
                return
            if not self.require_admin_token():
                return
            simulation_id = parsed.path.rsplit("/", 1)[-1]
            cancel_simulation_job(simulation_id)
            if delete_simulation(simulation_id):
                self.send_json(200, {"ok": True, "id": simulation_id})
            else:
                self.send_json(404, {"error": "simulation not found"})
            return
        self.send_error(404)

    def send_sse(self, event_name, payload):
        message = f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
        self.wfile.write(message.encode("utf-8"))
        self.wfile.flush()

    def handle_simulation_events(self, simulation_id):
        client_ip = self.client_ip()
        with RATE_LIMIT_LOCK:
            if SSE_CONNECTIONS[client_ip] >= SSE_MAX_CONNECTIONS_PER_IP:
                self.send_json(429, {"error": "too many SSE connections", "code": "sse_connection_limit"})
                return
            SSE_CONNECTIONS[client_ip] += 1
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            last_snapshot = None
            last_heartbeat = 0.0
            while True:
                simulation = get_simulation(simulation_id)
                if not simulation:
                    self.send_sse("error", {"error": "simulation not found"})
                    break
                snapshot = json.dumps(simulation, sort_keys=True, ensure_ascii=False)
                if snapshot != last_snapshot:
                    self.send_sse("simulation", simulation)
                    last_snapshot = snapshot
                now = time.time()
                if now - last_heartbeat >= max(15, min(30, SSE_HEARTBEAT_SECONDS)):
                    self.send_sse("heartbeat", {"ts": now_int()})
                    last_heartbeat = now
                if simulation.get("status") in {"completed", "failed", "cancelled", "timeout"}:
                    self.send_sse("terminal", {"status": simulation.get("status"), "id": simulation_id})
                    break
                time.sleep(1)
        except (BrokenPipeError, ConnectionResetError):
            return
        finally:
            with RATE_LIMIT_LOCK:
                SSE_CONNECTIONS[client_ip] = max(0, SSE_CONNECTIONS[client_ip] - 1)


def get_aero_price(timestamp):
    minute = timestamp - timestamp % 60
    if minute in AERO_PRICE_CACHE:
        return AERO_PRICE_CACHE[minute]

    query = urllib.parse.urlencode(
        {
            "aggregate": "1",
            "before_timestamp": str(minute + 60),
            "limit": "25",
            "currency": "usd",
        }
    )
    url = f"https://api.geckoterminal.com/api/v2/networks/base/pools/{AERO_USDC_POOL}/ohlcv/minute?{query}"
    req = urllib.request.Request(url, headers={"User-Agent": "wallet-watch/1.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        payload = json.load(response)

    rows = payload.get("data", {}).get("attributes", {}).get("ohlcv_list", [])
    if not rows:
        raise RuntimeError("empty AERO price response")

    best = None
    for row in rows:
        row_ts = int(row[0])
        if row_ts <= minute and (best is None or row_ts > int(best[0])):
            best = row
    if best is None:
        best = min(rows, key=lambda item: abs(int(item[0]) - minute))

    source_timestamp = int(best[0])
    price = float(best[4])
    if price <= 0:
        raise RuntimeError("invalid AERO price")
    result = {"timestamp": minute, "sourceTimestamp": source_timestamp, "price": price}
    AERO_PRICE_CACHE[minute] = result
    return result


if __name__ == "__main__":
    init_cache()
    init_simulations()
    set_keep_awake(True)
    print(f"Market data cache: {DATA_PATH}", file=sys.stderr, flush=True)
    print(f"Simulation data: {SIM_DATA_PATH}", file=sys.stderr, flush=True)
    print("Raw eth_getLogs JSON cache: disabled; logs are normalized and deduplicated", file=sys.stderr, flush=True)
    print(f"RPC upstreams: {', '.join(redact_url(url) for url in RPC_URLS)}", file=sys.stderr, flush=True)
    print(f"Listening on {HOST}:{PORT}", file=sys.stderr, flush=True)
    try:
        http.server.ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    finally:
        maybe_log_progress(force=True)
        set_keep_awake(False)
