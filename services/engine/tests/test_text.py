from datetime import date

import pytest

from engine.pipeline.text import find_date_range, find_dates, html_to_text, normalize_text


def test_normalize_text_collapses_whitespace_and_invisible_characters() -> None:
    raw = "  Markette\u00a0 2.500​ TL  \n\n\n\n  harcamaya\t100 TL  "
    assert normalize_text(raw) == "Markette 2.500 TL\n\nharcamaya 100 TL"


def test_html_to_text_drops_scripts_and_keeps_block_structure() -> None:
    html = """<html><head><style>p{}</style></head><body>
    <h1>Kampanya</h1><script>track()</script>
    <p>Markette <b>2.500 TL</b> harcamaya</p><ul><li>100 TL puan</li><li>Taksitli hariç</li></ul>
    </body></html>"""
    text = html_to_text(html)
    assert "track()" not in text
    assert text.splitlines()[0] == "Kampanya"
    assert "Markette" in text and "100 TL puan" in text and "Taksitli hariç" in text


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Kampanya 1 Kasım 2026 tarihinde başlar.", [date(2026, 11, 1)]),
        ("01.11.2026 - 30.11.2026 tarihleri arasında", [date(2026, 11, 1), date(2026, 11, 30)]),
        ("1/11/2026 ile 2026-12-31", [date(2026, 11, 1), date(2026, 12, 31)]),
        ("1-30 Kasım 2026 tarihleri arasında", [date(2026, 11, 1), date(2026, 11, 30)]),
        ("1 \u2013 30 KASIM 2026", [date(2026, 11, 1), date(2026, 11, 30)]),
        ("1 Kasım - 31 Aralık 2026", [date(2026, 11, 1), date(2026, 12, 31)]),
        ("15 Şubat 2027 ve 3 MAYIS 2027", [date(2027, 2, 15), date(2027, 5, 3)]),
        ("1 AĞUSTOS 2026, 9 EYLÜL 2026, 20 İŞİM 2026", [date(2026, 8, 1), date(2026, 9, 9)]),
        ("31 Şubat 2026 geçersiz, 31.04.2026 de", []),
        ("Tarih yok, yalnızca 2.500 TL", []),
    ],
)
def test_find_dates(text: str, expected: list[date]) -> None:
    assert find_dates(text) == expected


def test_find_date_range() -> None:
    assert find_date_range("1-30 Kasım 2026, son katılım 25 Kasım 2026") == (
        date(2026, 11, 1),
        date(2026, 11, 30),
    )
    assert find_date_range("Son gün 30.11.2026") == (date(2026, 11, 30), None)
    assert find_date_range("tarih yok") == (None, None)
