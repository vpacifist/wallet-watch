#!/usr/bin/env python3
import argparse
import csv
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone


POOL = "0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59"
NETWORK = "base"
BASE_URL = f"https://api.dexpaprika.com/networks/{NETWORK}/pools/{POOL}/ohlcv"


def parse_utc(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def fmt_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def fetch_window(start: datetime, end: datetime, interval: str, limit: int, retries: int):
    query = urllib.parse.urlencode(
        {
            "start": fmt_utc(start),
            "end": fmt_utc(end),
            "interval": interval,
            "limit": str(limit),
        }
    )
    url = f"{BASE_URL}?{query}"

    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "wallet-watch/1.0"})
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == retries:
                raise
        except urllib.error.URLError:
            if attempt == retries:
                raise

        time.sleep(min(60, 2 ** attempt))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export 1m OHLCV for Aerodrome WETH/USDC 0.05 pool on Base via DexPaprika."
    )
    parser.add_argument("--start", required=True, help="UTC start, for example 2026-05-03T00:00:00Z")
    parser.add_argument("--end", required=True, help="UTC end, for example 2026-05-03T01:00:00Z")
    parser.add_argument("--out", required=True, help="Output CSV path")
    parser.add_argument("--interval", default="1m", help="DexPaprika interval, default: 1m")
    parser.add_argument("--chunk-minutes", type=int, default=100, help="Minutes per API request")
    parser.add_argument("--limit", type=int, default=100, help="Rows per API request")
    parser.add_argument("--retries", type=int, default=6, help="Retries for transient API failures")
    args = parser.parse_args()

    start = parse_utc(args.start)
    end = parse_utc(args.end)
    if end <= start:
        raise SystemExit("--end must be after --start")

    rows_by_time = {}
    cursor = start
    chunk = timedelta(minutes=args.chunk_minutes)

    while cursor < end:
        window_end = min(cursor + chunk, end)
        rows = fetch_window(cursor, window_end, args.interval, args.limit, args.retries)
        for row in rows:
            rows_by_time[row["time_open"]] = row
        print(f"Fetched {len(rows):4d} rows: {fmt_utc(cursor)} -> {fmt_utc(window_end)}", file=sys.stderr)
        cursor = window_end

    fieldnames = ["time_open", "time_close", "open", "high", "low", "close", "volume"]
    with open(args.out, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for key in sorted(rows_by_time):
            writer.writerow({name: rows_by_time[key].get(name, "") for name in fieldnames})

    print(f"Wrote {len(rows_by_time)} rows to {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
