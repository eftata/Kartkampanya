"""Sözleşme senkronu: pydantic modelleri commit'li JSON Schema'dan üretilmiş haliyle aynı mı?

zod → JSON Schema senkronu `packages/shared` testinde denetlenir; burada JSON Schema → pydantic.
Kırılırsa: `pnpm plan:gen` ve üretilen dosyaları commit'le (ADR 0015).
"""

from pathlib import Path

import pytest

from scripts.gen_plan_models import OUT, generate


@pytest.mark.parametrize("kind", ["request", "response"])
def test_generated_models_are_up_to_date(kind: str, tmp_path: Path) -> None:
    generate(kind, tmp_path)
    expected = (tmp_path / f"{kind}.py").read_text(encoding="utf-8")
    actual = (OUT / f"{kind}.py").read_text(encoding="utf-8")
    assert actual == expected, "Plan modelleri eski: `pnpm plan:gen` çalıştır."
