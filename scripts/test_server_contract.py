import importlib.util
import gc
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
      with self.assertRaisesRegex(ValueError, "rangePct"):
        self.server.normalize_simulation_params({
            "start": "2026-02-01 00:00",
            "end": "2026-02-01 00:05",
            "rangePct": "100",
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


if __name__ == "__main__":
    unittest.main()
