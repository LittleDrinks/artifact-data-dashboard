#!/bin/bash
set -e

echo "=== Checking embedding model ==="
python -c "
import os, sys
sys.stdout.reconfigure(line_buffering=True)
model_name = 'BAAI/bge-m3'
cache_dir = os.environ.get('HF_HOME', os.path.expanduser('~/.cache/huggingface'))
from pathlib import Path
model_path = Path(cache_dir) / 'hub' / f'models--{model_name.replace(\"/\", \"--\")}'
if model_path.exists():
    print(f'Model already cached at {model_path}')
else:
    print(f'Downloading {model_name} from {os.environ.get(\"HF_ENDPOINT\", \"https://huggingface.co\")} ...')
    from sentence_transformers import SentenceTransformer
    SentenceTransformer(model_name)
    print('Download complete')
"

echo "=== Starting server ==="
exec uvicorn app.main:app --host 0.0.0.0 --port 8000