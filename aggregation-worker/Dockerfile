# ---------- base: runtime deps only ----------
FROM python:3.13-slim AS base
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---------- dev: add test deps + all source ----------
FROM base AS dev
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY . .
CMD ["python", "-m", "app.main"]

# ---------- prod: only application code ----------
FROM base AS prod
COPY app/ ./app/
CMD ["python", "-m", "app.main"]
