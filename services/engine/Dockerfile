# syntax=docker/dockerfile:1
# Build bağlamı: services/engine  →  docker build -t kartplan-engine services/engine
# Not: Railway uyumluluğu için BuildKit cache mount kullanılmaz (Railway özel id biçimi ister).

FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

FROM base AS builder
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_NO_CACHE=1
WORKDIR /app
# Önce yalnızca bağımlılıklar: kod değişince bu katman önbellekten gelir.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY engine ./engine
RUN uv sync --locked --no-dev --no-editable

FROM base AS runtime
RUN useradd --system --uid 10001 --no-create-home engine
WORKDIR /app
COPY --from=builder --chown=engine:engine /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" \
    PORT=8000
USER engine
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/health', timeout=2)"
# Railway/Fly PORT değişkenini verir; yoksa 8000.
CMD ["sh", "-c", "exec uvicorn engine.api:app --host 0.0.0.0 --port ${PORT} --proxy-headers"]
