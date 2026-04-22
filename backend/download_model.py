"""Download bge-m3 via modelscope (fast in China) with progress display."""
import os
import sys

sys.stdout.reconfigure(line_buffering=True)

CACHE_DIR = os.environ.get("HF_HOME", os.path.expanduser("~/.cache/huggingface"))
LOCAL_MODEL_DIR = "/tmp/modelscope_cache/Xorbits/bge-m3"

print(f"Downloading bge-m3 via modelscope...")
print(f"Cache dir: {CACHE_DIR}")

from modelscope import snapshot_download

print("Starting download...")
path = snapshot_download(
    "Xorbits/bge-m3",
    cache_dir="/tmp/modelscope_cache",
)
print(f"Download complete: {path}")

# Register model into HF cache so sentence-transformers can find it
from pathlib import Path
hf_cache_path = Path(CACHE_DIR) / "hub" / "models--BAAI--bge-m3"
snap_path = hf_cache_path / "snapshots"
if not hf_cache_path.exists():
    hf_cache_path.mkdir(parents=True, exist_ok=True)
    snap_path.mkdir(parents=True, exist_ok=True)
    # Create refs/main -> snapshot hash
    import hashlib
    snap_hash = hashlib.sha256(b"bge-m3-local").hexdigest()[:40]
    snap_dir = snap_path / snap_hash
    if not snap_dir.exists():
        import shutil
        shutil.copytree(LOCAL_MODEL_DIR, snap_dir)
    refs_dir = hf_cache_path / "refs"
    refs_dir.mkdir(exist_ok=True)
    (refs_dir / "main").write_text(snap_hash)
    print(f"Registered in HF cache: {hf_cache_path}")
else:
    print(f"Already in HF cache: {hf_cache_path}")

# Block HF remote access, force local only
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

from sentence_transformers import SentenceTransformer
model = SentenceTransformer("BAAI/bge-m3")
result = model.encode(["test"])
print(f"Model ready! Embedding dim: {result.shape[-1]}")
