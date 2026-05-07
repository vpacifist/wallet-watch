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
      self.server.SIM_DATA_PATH = Path(self.tempdir.name) / "simulations.sqlite"
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

      handler.headers = FakeHeaders({"X-Admin-API-Token": "secret-token"})
      self.assertTrue(handler.require_admin_token())

      handler.headers = FakeHeaders({"Authorization": "Bearer secret-token"})
      self.assertTrue(handler.require_admin_token())

      handler.headers = FakeHeaders({"X-Admin-API-Token": "wrong"})
      self.assertFalse(handler.require_admin_token())
      self.assertEqual(sent[-1][0], 401)

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


if __name__ == "__main__":
    unittest.main()
