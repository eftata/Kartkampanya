"""Değişiklik tespiti: metni aynı kalan kampanya yeniden ayıklanmaz (LLM maliyeti, admin yükü)."""

import hashlib
from dataclasses import dataclass
from enum import StrEnum

from engine.pipeline.adapters.base import RawCampaign
from engine.pipeline.text import normalize_text


def _fingerprint(text: str) -> str:
    """Karşılaştırma için: tüm boşluklar (satır sonları dahil) tek boşluğa iner."""
    return " ".join(normalize_text(text).split())


def content_hash(raw: RawCampaign) -> str:
    """Başlık, tarih aralığı ve şart metninin sha256 özeti (`Campaign.rawHash`).

    Boşluk, satır düzeni ve görünmez karakter farkları değişiklik sayılmaz.
    """
    parts = [
        _fingerprint(raw.title),
        raw.starts_at.isoformat() if raw.starts_at else "",
        raw.ends_at.isoformat() if raw.ends_at else "",
        _fingerprint(raw.raw_text),
    ]
    return hashlib.sha256("\n\x1f\n".join(parts).encode("utf-8")).hexdigest()


class Change(StrEnum):
    NEW = "new"  # veritabanında yok → ayıklanacak
    UNCHANGED = "unchanged"  # özet aynı → yalnızca "son görülme" güncellenir
    CHANGED = "changed"  # özet farklı → DRAFT'a çekilir ve yeniden ayıklanır


@dataclass(frozen=True)
class StoredCampaign:
    id: str
    raw_hash: str
    status: str


def classify(stored: StoredCampaign | None, raw_hash: str) -> Change:
    if stored is None:
        return Change.NEW
    return Change.UNCHANGED if stored.raw_hash == raw_hash else Change.CHANGED
