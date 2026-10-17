from dataclasses import replace
from datetime import date

from engine.pipeline.adapters.base import RawCampaign
from engine.pipeline.changes import Change, StoredCampaign, classify, content_hash

RAW = RawCampaign(
    source_url="https://banka.test/kampanya/1",
    title="Markette 2.500 TL'ye 100 TL puan",
    raw_text="Markette toplam 2.500 TL harcamaya 100 TL puan.\nEn fazla 300 TL.",
    starts_at=date(2026, 11, 1),
    ends_at=date(2026, 11, 30),
)


def test_hash_is_stable_sha256_hex() -> None:
    assert content_hash(RAW) == content_hash(replace(RAW))
    assert len(content_hash(RAW)) == 64


def test_whitespace_and_invisible_characters_are_not_changes() -> None:
    noisy = replace(
        RAW,
        title="  Markette 2.500 TL'ye\u00a0100 TL puan ",
        raw_text="Markette  toplam 2.500​ TL harcamaya 100 TL puan.\n\n\nEn fazla 300 TL.  ",
    )
    assert content_hash(noisy) == content_hash(RAW)


def test_text_title_or_date_changes_are_changes() -> None:
    base = content_hash(RAW)
    assert content_hash(replace(RAW, raw_text=RAW.raw_text.replace("300", "400"))) != base
    assert content_hash(replace(RAW, title="Markette 200 TL puan")) != base
    assert content_hash(replace(RAW, ends_at=date(2026, 12, 31))) != base
    assert content_hash(replace(RAW, starts_at=None)) != base


def test_source_url_is_not_part_of_the_hash() -> None:
    other_url = replace(RAW, source_url="https://banka.test/kampanya/2")
    assert content_hash(other_url) == content_hash(RAW)


def test_classify() -> None:
    raw_hash = content_hash(RAW)
    assert classify(None, raw_hash) is Change.NEW
    assert classify(StoredCampaign("c1", raw_hash, "APPROVED"), raw_hash) is Change.UNCHANGED
    assert classify(StoredCampaign("c1", "eski", "APPROVED"), raw_hash) is Change.CHANGED
