from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from engine.api import app
from engine.settings import Settings, get_settings

TEST_TOKEN = "test-engine-token"


def _settings_with(token: str) -> Settings:
    # _env_file=None: testler geliştiricinin .env dosyasından etkilenmesin.
    return Settings(_env_file=None, engine_token=token)


@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = lambda: _settings_with(TEST_TOKEN)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def client_without_token() -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = lambda: _settings_with("")
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
