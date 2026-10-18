"""Genel ayrıştırıcı: "GG.AA.YYYY  AÇIKLAMA  1.234,56" biçimli satırlar.

Türk bankalarının ekstrelerinin çoğu işlem satırını tarih + açıklama + tutar olarak dizer. Biçim
bankaya göre değiştiği için sonuç kullanıcıya onaylatılır; tanınmayan satırlar sayılır
(`unparsed_lines`), sessizce yutulmaz.
"""

import re
from datetime import date

from engine.statements.models import StatementRow
from engine.statements.parsers.base import StatementParser

_DATE = r"(?P<day>\d{2})[./-](?P<month>\d{2})[./-](?P<year>\d{4}|\d{2})"
# Tutar: işaret, "1.234,56", isteğe bağlı para birimi ve son ek (+/- ya da A=alacak, B=borç).
_AMOUNT = (
    r"(?P<sign>[-+])?\s?(?P<amount>\d{1,3}(?:\.\d{3})*,\d{2})\s?(?:TL|TRY)?"
    r"\s?(?P<suffix>[-+]|\(?[AB]\)?)?"
)
_LINE = re.compile(rf"^{_DATE}\s+(?P<desc>.+?)\s+{_AMOUNT}$")
_DATE_ONLY = re.compile(rf"^{_DATE}\b")
# "TAKSİT 2/6" ya da "2/6 TAKSİT"
_INSTALLMENT = re.compile(
    r"TAKS[İI]T\s*(\d{1,2})\s*/\s*(\d{1,2})|(\d{1,2})\s*/\s*(\d{1,2})\s*\.?\s*TAKS[İI]T"
)

# Harcama olmayan satırlar: ödeme, iade, faiz/ücret iadesi, toplamlar.
_CREDIT_WORDS = re.compile(
    r"\b(ÖDEME|ODEME|İADE|IADE|İPTAL|IPTAL|ALACAK|TOPLAM|DÖNEM BORCU|DONEM BORCU"
    r"|ASGARİ|ASGARI|DEVREDEN)\b"
)
# Kart numarası gibi uzun ya da maskeli rakam dizileri açıklamadan silinir.
_CARD_LIKE = re.compile(
    r"\b[\d*Xx]{4}[\s-]?[\d*Xx]{2,4}[\s-]?[\d*Xx]{2,4}[\s-]?[\d*Xx]{2,4}\b|\d{12,}"
)


def _upper(text: str) -> str:
    return text.replace("i", "İ").replace("ı", "I").upper()


def _to_kurus(amount: str) -> int:
    lira, kurus = amount.replace(".", "").split(",")
    return int(lira) * 100 + int(kurus)


def _to_day(day: str, month: str, year: str) -> str | None:
    full_year = int(year) + 2000 if len(year) == 2 else int(year)
    try:
        return date(full_year, int(month), int(day)).isoformat()
    except ValueError:
        return None


def clean_description(text: str) -> str:
    text = _CARD_LIKE.sub("", text)
    return " ".join(text.split())[:120]


class GenericParser(StatementParser):
    name = "genel"

    def parse(self, lines: list[str]) -> tuple[list[StatementRow], int, int]:
        rows: list[StatementRow] = []
        skipped = 0
        unparsed = 0
        for line in lines:
            match = _LINE.match(line)
            if not match:
                if _DATE_ONLY.match(line):
                    unparsed += 1
                continue
            description = match["desc"]
            upper = _upper(description)
            negative = match["sign"] == "-" or (match["suffix"] or "").strip("()") in (
                "-",
                "+",
                "A",
            )
            if negative or _CREDIT_WORDS.search(upper):
                skipped += 1
                continue
            day = _to_day(match["day"], match["month"], match["year"])
            amount = _to_kurus(match["amount"])
            if day is None or amount <= 0:
                unparsed += 1
                continue
            installment = _INSTALLMENT.search(upper)
            rows.append(
                StatementRow(
                    date=day,
                    description=clean_description(description) or "İşlem",
                    amount_kurus=amount,
                    installment=(
                        f"{installment[1] or installment[3]}/{installment[2] or installment[4]}"
                        if installment
                        else None
                    ),
                )
            )
        return rows, skipped, unparsed
