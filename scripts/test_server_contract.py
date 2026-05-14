import importlib.util
import gc
import io
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT / "scripts" / "serve_with_rpc.py"


def load_server_module():
    spec = importlib.util.spec_from_file_location("wallet_watch_server", SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeHeaders(dict):
    def get(self, name, default=None):
        for key, value in self.items():
            if key.lower() == name.lower():
                return value
        return default


class ServerContractTests(unittest.TestCase):
    def setUp(self):
      self.server = load_server_module()
      self.tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
      self.server.DATA_PATH = Path(self.tempdir.name) / "market_data.sqlite"
      self.server.SIM_DATA_PATH = Path(self.tempdir.name) / "simulations.sqlite"
      self.server.init_cache()
      self.server.init_simulations()

    def tearDown(self):
      gc.collect()
      self.tempdir.cleanup()

    def test_simulation_storage_lifecycle(self):
      self.server.insert_simulation("sim-1", {"start": "2026-02-01 00:00", "end": "2026-02-01 00:02"})
      self.server.update_simulation(
          "sim-1",
          status="running",
          progress_json=json.dumps({"rows": 1, "rawRows": [{"index": 0}]}),
      )

      item = self.server.get_simulation("sim-1")
      self.assertEqual(item["status"], "running")
      self.assertEqual(item["progress"]["rows"], 1)
      self.assertEqual(item["progress"]["rawRows"], [{"index": 0}])

      latest = self.server.get_latest_simulation()
      self.assertEqual(latest["progress"]["rawRowCount"], 1)
      self.assertNotIn("rawRows", latest["progress"])

      listed = self.server.list_simulations(limit=10)
      self.assertEqual([item["id"] for item in listed], ["sim-1"])
      self.assertTrue(self.server.delete_simulation("sim-1"))
      self.assertIsNone(self.server.get_simulation("sim-1"))

    def test_normalize_simulation_params(self):
      params = self.server.normalize_simulation_params({
          "start": "2026-02-01 00:00",
          "end": "2026-02-01 00:05",
          "deposit": "10'000",
          "rangePct": "1.5",
          "timeoutSeconds": "60",
          "progressEverySeconds": "2",
      })

      self.assertEqual(params["start"], "2026-02-01 00:00")
      self.assertEqual(params["end"], "2026-02-01 00:05")
      self.assertEqual(params["deposit"], "10'000")
      self.assertEqual(params["rangePct"], 1.5)
      self.assertEqual(params["timeoutSeconds"], 60)
      self.assertEqual(params["progressEverySeconds"], 2)
      self.assertIn("rebalanceFallbackSlippageBps", params)
      self.assertIn("rebalanceConfirmationBufferBps", params)
      self.assertEqual(params["rebalanceConfirmationMinutes"], 2)
      self.assertIn("aeroImpactHaircutMax", params)
      self.assertEqual(params["serverSimulationPollMs"], 2500)
      self.assertIn("lpFeeRate", params)

    def test_normalize_rejects_invalid_range(self):
      with self.assertRaisesRegex(self.server.ApiError, "rangePct"):
        self.server.normalize_simulation_params({
            "start": "2026-02-01 00:00",
            "end": "2026-02-01 00:05",
            "rangePct": "100",
        })

    def test_normalize_rejects_period_over_limit(self):
      self.server.MAX_SIMULATION_DAYS = 31
      with self.assertRaisesRegex(self.server.ApiError, "limited to 31 days"):
        self.server.normalize_simulation_params({
            "start": "2026-02-01 00:00",
            "end": "2026-03-10 00:00",
            "rangePct": "1",
        })

    def test_admin_token_accepts_header_or_bearer(self):
      self.server.ADMIN_API_TOKEN = "secret-token"
      handler = object.__new__(self.server.Handler)
      sent = []
      handler.send_json = lambda status, payload: sent.append((status, payload))
      handler.client_address = ("203.0.113.10", 12345)
      handler.command = "GET"
      handler.path = "/api/simulations"

      handler.headers = FakeHeaders({"X-Admin-API-Token": "secret-token"})
      self.assertTrue(handler.require_admin_token())

      handler.headers = FakeHeaders({"Authorization": "Bearer secret-token"})
      self.assertTrue(handler.require_admin_token())

      handler.headers = FakeHeaders({"X-Admin-API-Token": "wrong"})
      self.assertFalse(handler.require_admin_token())
      self.assertEqual(sent[-1][0], 401)

    def test_admin_token_accepts_query_for_sse(self):
      self.server.ADMIN_API_TOKEN = "secret-token"
      handler = object.__new__(self.server.Handler)
      handler.send_json = lambda status, payload: None
      handler.headers = FakeHeaders({})
      handler.path = "/api/simulations/sim-1/events?admin_token=secret-token"
      self.assertTrue(handler.require_admin_token())

    def test_rate_limit_is_per_bucket_and_ip(self):
      self.server.RATE_LIMITS.clear()
      handler = object.__new__(self.server.Handler)
      sent = []
      handler.send_json = lambda status, payload: sent.append((status, payload))
      handler.headers = FakeHeaders({})
      handler.client_address = ("203.0.113.10", 12345)

      self.assertTrue(handler.check_rate_limit("api", 2))
      self.assertTrue(handler.check_rate_limit("api", 2))
      self.assertFalse(handler.check_rate_limit("api", 2))
      self.assertEqual(sent[-1][0], 429)
      self.assertEqual(sent[-1][1]["code"], "rate_limit_exceeded")

    def test_progress_stream_persists_structured_rows(self):
      self.server.insert_simulation("sim-progress", {"start": "2026-02-01 00:00", "end": "2026-02-01 00:02"})
      pipe = io.StringIO(
          json.dumps({
              "type": "progress",
              "rows": 1,
              "latestRawRow": {"index": 0, "event": "price change"},
              "newRawRows": [{"index": 0, "event": "price change"}],
          }) + "\n"
      )

      self.server.stream_simulation_stdout("sim-progress", pipe)

      simulation = self.server.get_simulation("sim-progress")
      self.assertEqual(simulation["status"], "running")
      self.assertEqual(simulation["progress"]["latestRawRow"]["index"], 0)
      self.assertEqual(simulation["progress"]["newRawRows"][0]["event"], "price change")

    def test_progress_stream_accumulates_rows_between_polls(self):
      self.server.insert_simulation("sim-merge", {"start": "2026-02-01 00:00", "end": "2026-02-01 00:02"})
      pipe = io.StringIO(
          json.dumps({
              "type": "progress",
              "rows": 1,
              "latestRawRow": {"index": 0, "blockNumber": 10, "event": "deposit"},
              "newRawRows": [{"index": 0, "blockNumber": 10, "event": "deposit"}],
          }) + "\n" +
          json.dumps({
              "type": "progress",
              "rows": 2,
              "latestRawRow": {"index": 1, "blockNumber": 11, "event": "price change"},
              "newRawRows": [{"index": 1, "blockNumber": 11, "event": "price change"}],
          }) + "\n"
      )

      self.server.stream_simulation_stdout("sim-merge", pipe)

      simulation = self.server.get_simulation("sim-merge")
      self.assertEqual(simulation["progress"]["rawRowCount"], 2)
      self.assertEqual([row["index"] for row in simulation["progress"]["rawRows"]], [0, 1])
      self.assertEqual(simulation["progress"]["latestRawRow"]["index"], 1)

    def test_compact_simulation_response_removes_stored_row_arrays(self):
      simulation = {
          "id": "sim-compact",
          "progress": {
              "rows": 2,
              "newRawRows": [{"index": 1}],
              "rawRows": [{"index": 0}, {"index": 1}],
          },
          "result": {
              "rawRows": [{"index": 0}, {"index": 1}],
          },
      }

      compact = self.server.compact_simulation_response(simulation)

      self.assertNotIn("rawRows", compact["progress"])
      self.assertNotIn("rawRows", compact["result"])
      self.assertEqual(compact["progress"]["rawRowCount"], 2)
      self.assertEqual(compact["result"]["rawRowCount"], 2)
      self.assertEqual(compact["progress"]["newRawRows"], [{"index": 1}])

    def test_merge_progress_deduplicates_rows(self):
      self.server.insert_simulation("sim-dedupe", {"start": "2026-02-01 00:00", "end": "2026-02-01 00:02"})
      first = {"rows": 1, "newRawRows": [{"index": 1, "blockNumber": 10, "event": "tick"}]}
      self.server.update_simulation("sim-dedupe", progress_json=json.dumps(first))
      merged = self.server.merge_simulation_progress("sim-dedupe", {"rows": 2, "newRawRows": [{"index": 1, "blockNumber": 10, "event": "tick"}]})
      self.assertEqual(merged["rawRowCount"], 1)

    def test_log_cache_requires_full_partial_range_coverage(self):
      info = {
          "address": "0xpool",
          "topic0": "0xtopic",
          "from_block": 10,
          "to_block": 12,
      }
      log = {
          "address": "0xpool",
          "topics": ["0xtopic"],
          "blockNumber": "0xa",
          "transactionIndex": "0x0",
          "logIndex": "0x0",
          "transactionHash": "0xabc",
          "data": "0x",
      }
      self.server.store_log_result(info, [log])

      covered = self.server.cached_log_result({
          "address": "0xpool",
          "topic0": "0xtopic",
          "from_block": 10,
          "to_block": 12,
      })
      self.assertEqual([item["transactionHash"] for item in covered], ["0xabc"])

      partial = self.server.cached_log_result({
          "address": "0xpool",
          "topic0": "0xtopic",
          "from_block": 9,
          "to_block": 12,
      })
      self.assertIsNone(partial)

    def test_log_parsing_rejects_invalid_ranges(self):
      payload = {
          "method": "eth_getLogs",
          "params": [{
              "address": "0xpool",
              "fromBlock": "0x20",
              "toBlock": "0x10",
              "topics": ["0xtopic"],
          }],
      }
      self.assertIsNone(self.server.parse_supported_logs_filter(payload))

    def test_fetch_logs_chunks_orders_and_deduplicates(self):
      payload = {
          "id": 1,
          "method": "eth_getLogs",
          "params": [{
              "address": "0xpool",
              "fromBlock": "0x1",
              "toBlock": "0x4",
              "topics": ["0xtopic"],
          }],
      }
      info = {
          "address": "0xpool",
          "topic0": "0xtopic",
          "from_block": 1,
          "to_block": 4,
      }
      self.server.MAX_LOG_BLOCK_SPAN = 2
      calls = []

      def fake_upstream(chunk):
        calls.append((chunk["params"][0]["fromBlock"], chunk["params"][0]["toBlock"]))
        if chunk["params"][0]["fromBlock"] == "0x1":
          return {"result": [
              {"address": "0xpool", "topics": ["0xtopic"], "blockNumber": "0x2", "transactionIndex": "0x0", "logIndex": "0x1", "transactionHash": "0xbbb", "data": "0x"},
              {"address": "0xpool", "topics": ["0xtopic"], "blockNumber": "0x1", "transactionIndex": "0x0", "logIndex": "0x0", "transactionHash": "0xaaa", "data": "0x"},
          ]}
        return {"result": [
            {"address": "0xpool", "topics": ["0xtopic"], "blockNumber": "0x2", "transactionIndex": "0x0", "logIndex": "0x1", "transactionHash": "0xbbb", "data": "0x"},
            {"address": "0xpool", "topics": ["0xtopic"], "blockNumber": "0x4", "transactionIndex": "0x0", "logIndex": "0x0", "transactionHash": "0xccc", "data": "0x"},
        ]}

      self.server.upstream_post = fake_upstream
      logs = self.server.fetch_logs_in_chunks(payload, info)
      self.assertEqual(calls, [("0x1", "0x2"), ("0x3", "0x4")])
      self.assertEqual([log["transactionHash"] for log in logs], ["0xaaa", "0xbbb", "0xccc"])

    def test_log_prefetch_expands_small_misses_and_filters_response(self):
      self.server.LOG_PREFETCH_BLOCK_SPAN = 10
      calls = []

      def fake_upstream(payload, urls=None, label="RPC"):
        calls.append((payload["params"][0]["fromBlock"], payload["params"][0]["toBlock"]))
        return {
            "jsonrpc": "2.0",
            "id": payload.get("id"),
            "result": [
                {"address": "0xpool", "topics": ["0xtopic"], "blockNumber": "0xa", "transactionIndex": "0x0", "logIndex": "0x0", "transactionHash": "0xaaa", "data": "0x"},
                {"address": "0xpool", "topics": ["0xtopic"], "blockNumber": "0xf", "transactionIndex": "0x0", "logIndex": "0x0", "transactionHash": "0xbbb", "data": "0x"},
            ],
        }

      self.server.upstream_post = fake_upstream
      payload = {
          "jsonrpc": "2.0",
          "id": 1,
          "method": "eth_getLogs",
          "params": [{
              "address": "0xpool",
              "fromBlock": "0xc",
              "toBlock": "0xd",
              "topics": ["0xtopic"],
          }],
      }

      response = self.server.post_rpc(payload)
      self.assertEqual(calls, [("0xa", "0x13")])
      self.assertEqual(response["result"], [])

      cached = self.server.post_rpc({
          **payload,
          "params": [{
              "address": "0xpool",
              "fromBlock": "0xf",
              "toBlock": "0xf",
              "topics": ["0xtopic"],
          }],
      })
      self.assertEqual(calls, [("0xa", "0x13")])
      self.assertEqual([log["transactionHash"] for log in cached["result"]], ["0xbbb"])

    def test_historical_eth_call_uses_archive_route(self):
      self.server.RPC_URLS = ["https://regular.example"]
      self.server.ARCHIVE_RPC_URLS = ["https://archive.example"]
      payload = {"method": "eth_call", "params": [{"to": "0xabc", "data": "0x"}, "0x123"]}

      urls, label = self.server.upstream_for_payload(payload)

      self.assertEqual(urls, ["https://archive.example"])
      self.assertEqual(label, "Archive RPC")

    def test_logs_and_blocks_use_regular_route(self):
      self.server.RPC_URLS = ["https://regular.example"]
      self.server.ARCHIVE_RPC_URLS = ["https://archive.example"]
      log_payload = {"method": "eth_getLogs", "params": [{"address": "0xpool", "fromBlock": "0x1", "toBlock": "0x2", "topics": ["0xtopic"]}]}
      block_payload = {"method": "eth_getBlockByNumber", "params": ["0x123", False]}

      log_urls, log_label = self.server.upstream_for_payload(log_payload)
      block_urls, block_label = self.server.upstream_for_payload(block_payload)

      self.assertEqual(log_urls, ["https://regular.example"])
      self.assertEqual(log_label, "RPC")
      self.assertEqual(block_urls, ["https://regular.example"])
      self.assertEqual(block_label, "RPC")

    def test_split_upstream_batches_separates_archive_calls(self):
      self.server.MAX_UPSTREAM_BATCH_SIZE = 3
      self.server.RPC_URLS = ["https://regular.example"]
      self.server.ARCHIVE_RPC_URLS = ["https://archive.example"]
      regular = {"method": "eth_getBlockByNumber", "params": ["0x123", False]}
      archive = {"method": "eth_call", "params": [{"to": "0xabc", "data": "0x"}, "0x123"]}
      items = [((0, "exact", None, "regular", regular), regular), ((1, "exact", None, "archive", archive), archive)]

      batches = self.server.split_upstream_batches(items)

      self.assertEqual(len(batches), 2)
      self.assertEqual(batches[0][0][1], "RPC")
      self.assertEqual(batches[1][0][1], "Archive RPC")

    def test_empty_route_raises_configuration_error(self):
      with self.assertRaisesRegex(RuntimeError, "Archive RPC URLs are not configured"):
        self.server.upstream_post({"method": "eth_call", "params": [{"to": "0xabc", "data": "0x"}, "0x123"]}, urls=[], label="Archive RPC")


if __name__ == "__main__":
    unittest.main()
