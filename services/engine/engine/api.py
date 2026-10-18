import platform
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from pydantic import BaseModel

from engine import __version__
from engine.optimizer.contract.request import PlanRequest
from engine.optimizer.contract.response import PlanResponse
from engine.optimizer.solve import optimize
from engine.security import require_engine_token
from engine.settings import get_settings
from engine.statements.extract import StatementError
from engine.statements.models import StatementParseRequest, StatementParseResult
from engine.statements.parse import parse_statement
from engine.telemetry import init_sentry

init_sentry(get_settings())

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


# ENGINE_TOKEN ile korunan uçlar.
protected = APIRouter(dependencies=[Depends(require_engine_token)])


@protected.get("/info")
def info() -> InfoResponse:
    """Korumalı örnek uç: servis sürümünü döner."""
    return InfoResponse(
        service="kartplan-engine", version=__version__, python=platform.python_version()
    )


@protected.post("/optimize")
def optimize_plan(request: PlanRequest) -> PlanResponse:
    """Aylık plan: PlanRequest → PlanResponse (durumsuz; ADR 0015). CPU işi, iş parçacığında."""
    return optimize(request)


@protected.post("/statements/parse", response_model_by_alias=True)
def parse_statement_pdf(request: StatementParseRequest) -> StatementParseResult:
    """Ekstre PDF'i → harcama satırları (ADR 0028). PDF, metin ve parola saklanmaz/günlüğe yazılmaz;
    hata yalnızca kodla döner (`invalid`, `too_large`, `too_many_pages`, `password_required`,
    `wrong_password`)."""
    try:
        return parse_statement(request.pdf_base64, request.password)
    except StatementError as error:
        raise HTTPException(status_code=422, detail=error.code) from None


app.include_router(protected)
