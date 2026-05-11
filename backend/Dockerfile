FROM python:3.12-slim

WORKDIR /app

ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
RUN pip config set global.index-url ${PIP_INDEX_URL}

COPY requirements.txt .
RUN pip install --no-cache-dir --timeout=120 --retries=5 -r requirements.txt

# Install modelscope for faster download in China, then download bge-m3
RUN pip install --no-cache-dir modelscope
COPY download_model.py .
RUN python download_model.py || \
    echo "WARNING: Model download failed, will retry at runtime"

COPY . .

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
