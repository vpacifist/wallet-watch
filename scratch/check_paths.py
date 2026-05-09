import os
from pathlib import Path

ROOT = Path(r"c:\projects\wallet-watch\scripts\serve_with_rpc.py").resolve().parents[1]
print(f"ROOT: {ROOT}")
print(f"exists: {(ROOT / '.env').exists()}")
