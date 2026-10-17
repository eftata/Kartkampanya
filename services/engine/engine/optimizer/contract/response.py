# Üretilmiş dosya — elle düzenleme. Kaynak: packages/shared/src/plan.ts (ADR 0015).
# Yeniden üret: pnpm plan:gen

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class PlanAllocation(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    category: Annotated[str, Field(max_length=100, min_length=1)]
    card: Annotated[str, Field(max_length=100, min_length=1)]
    amount: Annotated[int, Field(ge=0, le=9007199254740991)]
    campaigns: list[str]
    expectedReward: Annotated[int, Field(ge=0, le=9007199254740991)]


class PlanCampaignHit(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: Annotated[str, Field(max_length=100, min_length=1)]
    tiers: Annotated[int, Field(ge=1, le=9007199254740991)]
    reward: Annotated[int, Field(ge=0, le=9007199254740991)]


class PlanNearMiss(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: Annotated[str, Field(max_length=100, min_length=1)]
    missingAmount: Annotated[int, Field(ge=0, le=9007199254740991)]
    extraReward: Annotated[int, Field(ge=0, le=9007199254740991)]


class PlanUnallocated(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    category: Annotated[str, Field(max_length=100, min_length=1)]
    amount: Annotated[int, Field(ge=0, le=9007199254740991)]


class PlanBaseline(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    strategy: Literal["single_best_card"]
    card: Annotated[str | None, Field(max_length=100, min_length=1)]
    total: Annotated[int, Field(ge=0, le=9007199254740991)]


class PlanSolver(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    engine: Literal["cp-sat", "greedy"]
    ms: Annotated[int, Field(ge=0, le=9007199254740991)]


class PlanResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    status: Literal["OPTIMAL", "FEASIBLE", "FALLBACK"]
    allocations: list[PlanAllocation]
    campaignsHit: list[PlanCampaignHit]
    nearMisses: list[PlanNearMiss]
    unallocated: list[PlanUnallocated]
    totalExpected: Annotated[int, Field(ge=0, le=9007199254740991)]
    baseline: PlanBaseline
    solver: PlanSolver
