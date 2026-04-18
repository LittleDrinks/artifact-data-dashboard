FROM python:3.12-slim

WORKDIR /app

# Use Tsinghua mirror for faster downloads in China
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# Install dependencies first (cache layer)
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout=120 --retries=5 -r requirements.txt

# Pre-download bge-m3 embedding model (~2GB) at build time
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-m3')"

# Copy application code
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
