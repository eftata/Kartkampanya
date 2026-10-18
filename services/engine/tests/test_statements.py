import base64

import pytest
from fastapi.testclient import TestClient

from engine.statements.extract import MAX_PAGES, StatementError, extract_lines
from engine.statements.parse import parse_statement
from engine.statements.parsers.generic import GenericParser, clean_description
from tests.conftest import TEST_TOKEN
from tests.pdf_helper import encrypt, make_pdf

AUTH = {"Authorization": f"Bearer {TEST_TOKEN}"}

# SENTETİK ekstre satırları (gerçek bir bankanın biçimi değildir).
LINES = [
    "ORNEK BANK KREDI KARTI HESAP OZETI",
    "Kart No: 4543 12** **** 9876",
    "05.11.2026 MIGROS KADIKOY ISTANBUL 450,00",
    "06.11.2026 OPET AKARYAKIT 1.250,50 TL",
    "07.11.2026 TEKNOSA TAKSIT 2/6 1.000,00",
    "08.11.2026 ODEME - TESEKKURLER -5.000,00",
    "09.11.2026 IADE TRENDYOL 120,00 +",
    "10.11.26 STARBUCKS 85,00 B",
    "11.11.2026 YEMEKSEPETI 230,00 A",
    "DONEM BORCU 2.935,50",
    "12.11.2026 BOZUK SATIR TUTARSIZ",
]


def test_generic_parser_reads_purchases_and_skips_credits() -> None:
    rows, skipped, unparsed = GenericParser().parse(LINES)
    assert [(row.date, row.description, row.amount_kurus, row.installment) for row in rows] == [
        ("2026-11-05", "MIGROS KADIKOY ISTANBUL", 45_000, None),
        ("2026-11-06", "OPET AKARYAKIT", 125_050, None),
        ("2026-11-07", "TEKNOSA TAKSIT 2/6", 100_000, "2/6"),
        ("2026-11-10", "STARBUCKS", 8_500, None),
    ]
    assert skipped == 3  # ödeme, iade, alacak (A)
    assert unparsed == 1


def test_generic_parser_rejects_impossible_dates() -> None:
    rows, _, unparsed = GenericParser().parse(["31.02.2026 HATALI TARIH 10,00"])
    assert rows == []
    assert unparsed == 1


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("MIGROS 4543 12** **** 9876 ISTANBUL", "MIGROS ISTANBUL"),
        ("KART 4543120000009876", "KART"),
        ("  COK   BOSLUK  ", "COK BOSLUK"),
    ],
)
def test_clean_description_removes_card_numbers(text: str, expected: str) -> None:
    assert clean_description(text) == expected


def test_extract_lines_from_pdf() -> None:
    lines, pages = extract_lines(make_pdf([LINES[:4], LINES[4:]]))
    assert pages == 2
    assert "05.11.2026 MIGROS KADIKOY ISTANBUL 450,00" in lines
    assert "DONEM BORCU 2.935,50" in lines


def test_encrypted_pdf_requires_the_right_password() -> None:
    data = encrypt(make_pdf([LINES]), "12345")
    with pytest.raises(StatementError) as missing:
        extract_lines(data)
    assert missing.value.code == "password_required"
    with pytest.raises(StatementError) as wrong:
        extract_lines(data, "00000")
    assert wrong.value.code == "wrong_password"
    lines, _ = extract_lines(data, "12345")
    assert "06.11.2026 OPET AKARYAKIT 1.250,50 TL" in lines


@pytest.mark.parametrize(
    ("data", "code"),
    [
        (b"not a pdf", "invalid"),
        (b"%PDF-1.4\ngarbage", "invalid"),
        (b"%PDF-" + b"0" * (4 * 1024 * 1024), "too_large"),
    ],
)
def test_extract_lines_rejects_bad_input(data: bytes, code: str) -> None:
    with pytest.raises(StatementError) as error:
        extract_lines(data)
    assert error.value.code == code


def test_too_many_pages() -> None:
    with pytest.raises(StatementError) as error:
        extract_lines(make_pdf([["x"]] * (MAX_PAGES + 1)))
    assert error.value.code == "too_many_pages"


def test_parse_statement_end_to_end() -> None:
    pdf = base64.b64encode(make_pdf([LINES])).decode()
    result = parse_statement(pdf)
    assert result.parser == "genel"
    assert result.pages == 1
    assert len(result.rows) == 4
    assert result.model_dump(by_alias=True)["rows"][0] == {
        "date": "2026-11-05",
        "description": "MIGROS KADIKOY ISTANBUL",
        "amountKurus": 45_000,
        "installment": None,
    }


def test_api_requires_token_and_returns_error_codes(client: TestClient) -> None:
    pdf = base64.b64encode(make_pdf([LINES])).decode()
    assert client.post("/statements/parse", json={"pdfBase64": pdf}).status_code == 401
    ok = client.post("/statements/parse", json={"pdfBase64": pdf}, headers=AUTH)
    assert ok.status_code == 200
    assert ok.json()["skippedCredits"] == 3
    locked = base64.b64encode(encrypt(make_pdf([LINES]), "pw")).decode()
    error = client.post("/statements/parse", json={"pdfBase64": locked}, headers=AUTH)
    assert error.status_code == 422
    assert error.json() == {"detail": "password_required"}
