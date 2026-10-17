"""`python -m engine.pipeline`: ağa/veritabanına çıkmadan önceki argüman denetimi."""

import pytest

from engine.pipeline.__main__ import main

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


async def test_unknown_adapter_exits_before_any_work(capsys: pytest.CaptureFixture[str]) -> None:
    assert await main(["olmayan-banka"]) == 2
    assert "Bilinmeyen adaptör: olmayan-banka" in capsys.readouterr().err
