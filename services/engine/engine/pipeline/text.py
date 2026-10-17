"""Kampanya sayfası metni: HTML'den düz metin, boşluk temizliği ve Türkçe tarih ayrıştırma."""

import re
import unicodedata
from datetime import date

from selectolax.lexbor import LexborHTMLParser

_ZERO_WIDTH = re.compile(r"[​‌‍⁠﻿]")
_SPACES = re.compile(r"[^\S\n]+")
_BLANK_LINES = re.compile(r"\n{3,}")


def normalize_text(text: str) -> str:
    """NFC, görünmez karakterler gider, satır içi boşluklar teke iner, en fazla bir boş satır."""
    text = unicodedata.normalize("NFC", text).replace("\xa0", " ")
    text = _ZERO_WIDTH.sub("", text)
    lines = [_SPACES.sub(" ", line).strip() for line in text.splitlines()]
    return _BLANK_LINES.sub("\n\n", "\n".join(lines)).strip()


def html_to_text(html: str) -> str:
    """HTML parçasını okunur düz metne çevirir (script/style atılır, bloklar ayrı satıra düşer)."""
    tree = LexborHTMLParser(html)
    for node in tree.css("script, style, noscript, template"):
        node.decompose()
    root = tree.body or tree.root
    if root is None:
        return ""
    return normalize_text(root.text(separator="\n"))


_MONTHS = {
    "ocak": 1,
    "şubat": 2,
    "mart": 3,
    "nisan": 4,
    "mayıs": 5,
    "haziran": 6,
    "temmuz": 7,
    "ağustos": 8,
    "eylül": 9,
    "ekim": 10,
    "kasım": 11,
    "aralık": 12,
}
_MONTH_RE = "|".join(_MONTHS)


def _lower_tr(text: str) -> str:
    """Türkçe küçük harf: İ → i, I → ı (str.lower 'İ'yi 'i̇' yapar)."""
    return text.replace("İ", "i").replace("I", "ı").lower()


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


_NUMERIC = re.compile(r"\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b")
_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_LONG = re.compile(rf"\b(\d{{1,2}})\s+({_MONTH_RE})\s+(\d{{4}})\b")
# "1-30 Kasım 2026" / "1 \u2013 30 Kasım 2026": ilk günün ayı ve yılı ikinciden gelir.
_SHORT_RANGE = re.compile(
    rf"\b(\d{{1,2}})\s*[-\u2013\u2014]\s*(\d{{1,2}})\s+({_MONTH_RE})\s+(\d{{4}})\b"
)
# "1 Kasım - 31 Aralık 2026": ilk tarihin yılı ikinciden gelir.
_MONTH_RANGE = re.compile(
    rf"\b(\d{{1,2}})\s+({_MONTH_RE})\s*[-\u2013\u2014]\s*(\d{{1,2}})\s+({_MONTH_RE})\s+(\d{{4}})\b"
)


def find_dates(text: str) -> list[date]:
    """Metindeki tarihleri geçtikleri sırayla döndürür (geçersiz tarihler atlanır)."""
    lowered = _lower_tr(text)
    found: list[tuple[int, date]] = []
    taken: list[range] = []

    def add(match: re.Match[str], *values: tuple[int, date | None]) -> None:
        # Daha önce işlenmiş bir aralığın içindeki eşleşme (ör. "30 Kasım 2026" parçası) atlanır.
        if any(match.start() in span for span in taken):
            return
        found.extend((pos, value) for pos, value in values if value is not None)
        taken.append(range(match.start(), match.end()))

    for m in _MONTH_RANGE.finditer(lowered):
        year = int(m[5])
        add(
            m,
            (m.start(), _safe_date(year, _MONTHS[m[2]], int(m[1]))),
            (m.start(3), _safe_date(year, _MONTHS[m[4]], int(m[3]))),
        )
    for m in _SHORT_RANGE.finditer(lowered):
        month, year = _MONTHS[m[3]], int(m[4])
        add(
            m,
            (m.start(), _safe_date(year, month, int(m[1]))),
            (m.start(2), _safe_date(year, month, int(m[2]))),
        )
    for m in _LONG.finditer(lowered):
        add(m, (m.start(), _safe_date(int(m[3]), _MONTHS[m[2]], int(m[1]))))
    for m in _NUMERIC.finditer(lowered):
        add(m, (m.start(), _safe_date(int(m[3]), int(m[2]), int(m[1]))))
    for m in _ISO.finditer(lowered):
        add(m, (m.start(), _safe_date(int(m[1]), int(m[2]), int(m[3]))))
    return [value for _, value in sorted(found, key=lambda item: item[0])]


def find_date_range(text: str) -> tuple[date | None, date | None]:
    """Kampanya geçerlilik aralığı: metindeki ilk iki tarih (biri yoksa None)."""
    dates = find_dates(text)
    start = dates[0] if dates else None
    end = dates[1] if len(dates) > 1 else None
    return start, end
