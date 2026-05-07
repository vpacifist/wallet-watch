#!/usr/bin/env python3
import argparse
import json
import os
import statistics
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BLOCK = 29100000
WETH_ADDRESS = "0x4200000000000000000000000000000000000006"
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"


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
        if key and key not in os.environ:
            os.environ[key] = value


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


def rpc_post(url, payload, timeout):
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "wallet-watch-rpc-check/1.0"},
        method="POST",
    )
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
    elapsed_ms = (time.perf_counter() - started) * 1000
    parsed = json.loads(raw)
    return parsed, elapsed_ms, len(raw)


def require_result(response):
    if isinstance(response, list):
        errors = [item.get("error") for item in response if item.get("error")]
        if errors:
            raise RuntimeError(errors[0].get("message", str(errors[0])))
        return response
    if response.get("error"):
        raise RuntimeError(response["error"].get("message", str(response["error"])))
    return response.get("result")


def check_endpoint(url, block_number, log_span, samples, timeout):
    block_tag = hex(block_number)
    log_to_block = hex(block_number + log_span)
    checks = [
        ("block", {"jsonrpc": "2.0", "id": 1, "method": "eth_getBlockByNumber", "params": [block_tag, False]}),
        ("call", {"jsonrpc": "2.0", "id": 2, "method": "eth_call", "params": [{"to": WETH_ADDRESS, "data": "0x313ce567"}, block_tag]}),
        ("batch", [
            {"jsonrpc": "2.0", "id": 3, "method": "eth_call", "params": [{"to": WETH_ADDRESS, "data": "0x313ce567"}, block_tag]},
            {"jsonrpc": "2.0", "id": 4, "method": "eth_getBlockByNumber", "params": [block_tag, False]},
        ]),
        ("logs", {
            "jsonrpc": "2.0",
            "id": 5,
            "method": "eth_getLogs",
            "params": [{
                "address": WETH_ADDRESS,
                "topics": [TRANSFER_TOPIC],
                "fromBlock": block_tag,
                "toBlock": log_to_block,
            }],
        }),
    ]
    results = []
    for name, payload in checks:
        timings = []
        error = ""
        bytes_read = 0
        for _ in range(samples):
            try:
                response, elapsed_ms, size = rpc_post(url, payload, timeout)
                require_result(response)
                timings.append(elapsed_ms)
                bytes_read = max(bytes_read, size)
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
                error = str(exc)
                break
        ok = bool(timings) and not error
        results.append({
            "check": name,
            "ok": ok,
            "median_ms": round(statistics.median(timings), 1) if timings else None,
            "bytes": bytes_read,
            "error": error[:180],
        })
    return results


def print_table(rows):
    headers = ["endpoint", "check", "ok", "median_ms", "bytes", "error"]
    widths = {header: len(header) for header in headers}
    for row in rows:
        for header in headers:
            widths[header] = max(widths[header], len(str(row.get(header, ""))))
    print("  ".join(header.ljust(widths[header]) for header in headers))
    print("  ".join("-" * widths[header] for header in headers))
    for row in rows:
        print("  ".join(str(row.get(header, "")).ljust(widths[header]) for header in headers))


def main():
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(description="Check Base RPC endpoints for wallet-watch historical simulation methods.")
    parser.add_argument("--urls", default=os.environ.get("BASE_RPC_URLS", ""), help="Comma-separated RPC URLs. Defaults to BASE_RPC_URLS.")
    parser.add_argument("--block", type=int, default=int(os.environ.get("BASE_RPC_CHECK_BLOCK", DEFAULT_BLOCK)))
    parser.add_argument("--log-span", type=int, default=int(os.environ.get("BASE_RPC_CHECK_LOG_SPAN", "50")))
    parser.add_argument("--samples", type=int, default=int(os.environ.get("BASE_RPC_CHECK_SAMPLES", "2")))
    parser.add_argument("--timeout", type=float, default=float(os.environ.get("BASE_RPC_CHECK_TIMEOUT", "30")))
    args = parser.parse_args()

    urls = [url.strip() for url in args.urls.split(",") if url.strip()]
    if not urls:
        raise SystemExit("No RPC URLs provided. Set BASE_RPC_URLS or pass --urls.")

    rows = []
    for url in urls:
        for result in check_endpoint(url, args.block, args.log_span, max(1, args.samples), args.timeout):
            rows.append({"endpoint": redact_url(url), **result})
    print_table(rows)


if __name__ == "__main__":
    main()
