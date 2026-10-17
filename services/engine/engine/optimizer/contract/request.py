# Üretilmiş dosya — elle düzenleme. Kaynak: packages/shared/src/plan.ts (ADR 0015).
# Yeniden üret: pnpm plan:gen

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class PlanBudgetItem(BaseModel):
    """
    Kategori başına aylık harcama (kuruş). Kategori, kampanyalardaki adla aynı olmalı.
    """

    model_config = ConfigDict(
        extra="forbid",
    )
    category: Annotated[str, Field(max_length=100, min_length=1)]
    amount: Annotated[int, Field(ge=0, le=10000000000)]


type BaseRateBpsAdditionalProperty = Annotated[int, Field(ge=0, le=10000)]


class PlanCard(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: Annotated[str, Field(max_length=100, min_length=1)]
    limit: Annotated[int | None, Field(ge=0, le=10000000000)]
    baseRateBps: dict[str, BaseRateBpsAdditionalProperty]


class PlanCampaign(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: Annotated[str, Field(max_length=100, min_length=1)]
    cards: Annotated[list[str], Field(min_length=1)]
    categories: list[str]
    thresholdType: Literal["SINGLE", "CUMULATIVE", "TXN_COUNT"]
    threshold: Annotated[int, Field(ge=0, le=10000000000)]
    txnCount: Annotated[int | None, Field(ge=1, le=9007199254740991)] = None
    tierRepeat: bool
    reward: Annotated[int, Field(ge=0, le=10000000000)]
    rewardBps: Annotated[int | None, Field(ge=0, le=10000)] = None
    cap: Annotated[int | None, Field(ge=0, le=10000000000)]
    eligible: bool
    group: Annotated[str | None, Field(max_length=100, min_length=1)] = None


class PlanOptions(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    maxCards: Annotated[int, Field(ge=1, le=20)] = 3
    timeLimitMs: Annotated[int, Field(ge=100, le=10000)] = 2000


class PlanRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    month: Annotated[str, Field(pattern="^\\d{4}-(0[1-9]|1[0-2])$")]
    budget: Annotated[list[PlanBudgetItem], Field(max_length=50)]
    cards: Annotated[list[PlanCard], Field(max_length=20, min_length=1)]
    campaigns: Annotated[list[PlanCampaign], Field(max_length=1000)]
    options: PlanOptions | None = None
