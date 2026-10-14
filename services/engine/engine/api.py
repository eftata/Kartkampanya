import platform
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI
from pydantic import BaseModel

from engine import __version__
from engine.security import require_engine_token

app = FastAPI(
    title="KartPlan Engine",
    version=__version__,
    # İç servis: dokümantasyon sayfaları dışarı açılmaz.
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


class HealthResponse(BaseModel):
    status: Literal["ok"]


class InfoResponse(BaseModel):
    service: str
    version: str
    python: str


@app.get("/health")
def health() -> HealthResponse:
    """Kimlik doğrulamasız canlılık kontrolü (platform health check'leri için)."""
    return HealthResponse(status="ok")


# ENGINE_TOKEN ile korunan uçlar. Sprint 2: /pipeline/run, Sprint 4: /optimize buraya eklenir.
protected = APIRouter(dependencies=[Depends(require_engine_token)])


@protected.get("/info")
def info() -> InfoResponse:
    """Korumalı örnek uç: servis sürümünü döner."""
    return InfoResponse(
        service="kartplan-engine", version=__version__, python=platform.python_version()
    )


app.include_router(protected)
