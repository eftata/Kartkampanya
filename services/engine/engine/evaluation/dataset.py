"""Etiketli vaka seti: `eval/cases/<id>.json` + `eval/catalog.json`.

Her vaka bir kampanyanın ham metni ve **insanın doğruladığı** beklenen kurallarıdır. Kategori ve
marka slug/ad olarak yazılır (veritabanı id'si değil): set veritabanından bağımsız taşınabilir ve
okunabilir kalır. Değerlendirme kataloğu `catalog.json`'dan kurar, veritabanına gitmez.
"""

import json
import re
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from engine.pipeline.adapters.base import RawCampaign
from engine.pipeline.extract import Catalog, ExtractedRule

CASE_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


class Expected(BaseModel):
    """Beklenen çıktı: ayıklamanın puanlanan alanları (özet ve güven puanlanmaz)."""

    model_config = ConfigDict(extra="forbid")

    join_method: Literal["AUTO", "SMS", "APP", "WEB"]
    join_deadline: date | None = None
    rules: list[ExtractedRule] = Field(min_length=1)


class LabeledCase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    source_url: str
    title: str
    starts_at: date | None
    ends_at: date | None
    raw_text: str = Field(min_length=1)
    expected: Expected
    # Etiketin kaynağı: "admin" (onay kuyruğunda düzeltilip onaylandı) ya da "elle" (LLM çıktısı
    # görülmeden sıfırdan etiketlendi; LLM önerisine çapalanma riski yok).
    labeled_by: Literal["admin", "elle"]
    synthetic: bool = False  # SENTETİK vaka: yalnızca testlerde, doğruluk raporuna girmez
    notes: str = ""

    @field_validator("id")
    @classmethod
    def _id(cls, value: str) -> str:
        if not CASE_ID.fullmatch(value):
            raise ValueError("id küçük harf, rakam ve tireden oluşmalı")
        return value

    def raw(self) -> RawCampaign:
        return RawCampaign(
            source_url=self.source_url,
            title=self.title,
            raw_text=self.raw_text,
            starts_at=self.starts_at,
            ends_at=self.ends_at,
        )


def eval_catalog(categories: list[str], merchants: list[str]) -> Catalog:
    """Değerlendirme kataloğu: id yerine slug/ad (tahmin ve beklenen doğrudan karşılaştırılır)."""
    return Catalog(
        categories={slug: slug for slug in categories},
        merchants={name: name for name in merchants},
    )


def load_catalog(directory: Path) -> Catalog:
    data = json.loads((directory / "catalog.json").read_text(encoding="utf-8"))
    return eval_catalog(list(data["categories"]), list(data["merchants"]))


def write_catalog(directory: Path, catalog: Catalog) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    payload = {"categories": sorted(catalog.categories), "merchants": sorted(catalog.merchants)}
    (directory / "catalog.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def load_cases(directory: Path, catalog: Catalog) -> list[LabeledCase]:
    """Vakaları okur ve katalogla doğrular (beklenen kategori/marka katalogda olmalı)."""
    cases = []
    for path in sorted((directory / "cases").glob("*.json")):
        case = LabeledCase.model_validate_json(
            path.read_text(encoding="utf-8"), context={"catalog": catalog}
        )
        if path.stem != case.id:
            raise ValueError(f"{path.name}: dosya adı vaka id'siyle aynı olmalı ({case.id})")
        cases.append(case)
    return cases


def write_case(directory: Path, case: LabeledCase) -> Path:
    path = directory / "cases" / f"{case.id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(case.model_dump_json(indent=2) + "\n", encoding="utf-8")
    return path
