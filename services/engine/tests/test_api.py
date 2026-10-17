import pytest
from fastapi.testclient import TestClient

from engine import __version__
from engine.settings import Settings
from tests.conftest import TEST_TOKEN


def test_health_requires_no_token(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_info_with_valid_token(client: TestClient) -> None:
    response = client.get("/info", headers={"Authorization": f"Bearer {TEST_TOKEN}"})
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "kartplan-engine"
    assert body["version"] == __version__
    assert body["python"].startswith("3.12")


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer wrong-token"},
        {"Authorization": f"Basic {TEST_TOKEN}"},
        {"Authorization": TEST_TOKEN},
    ],
    ids=["missing", "wrong", "wrong-scheme", "no-scheme"],
)
def test_info_rejects_bad_credentials(client: TestClient, headers: dict[str, str]) -> None:
    response = client.get("/info", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_protected_endpoints_fail_closed_without_configured_token(
    client_without_token: TestClient,
) -> None:
    # Anahtar tanımlı değilse boş token bile kabul edilmemeli.
    for headers in ({}, {"Authorization": "Bearer "}, {"Authorization": "Bearer anything"}):
        response = client_without_token.get("/info", headers=headers)
        assert response.status_code == 503


def test_docs_are_not_exposed(client: TestClient) -> None:
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


def test_settings_reads_engine_token_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENGINE_TOKEN", "from-env")
    assert Settings(_env_file=None).engine_token.get_secret_value() == "from-env"


def test_optimize_requires_token_and_returns_plan(client: TestClient) -> None:
    from tests.test_optimizer import EXAMPLE

    body = EXAMPLE.model_dump(mode="json")
    assert client.post("/optimize", json=body).status_code == 401
    response = client.post(
        "/optimize", json=body, headers={"Authorization": f"Bearer {TEST_TOKEN}"}
    )
    assert response.status_code == 200
    plan = response.json()
    assert plan["totalExpected"] == 66500
    assert plan["baseline"] == {"strategy": "single_best_card", "card": "A", "total": 26500}


def test_optimize_rejects_invalid_request(client: TestClient) -> None:
    headers = {"Authorization": f"Bearer {TEST_TOKEN}"}
    bad = {"month": "2026-13", "budget": [], "cards": [], "campaigns": []}
    assert client.post("/optimize", json=bad, headers=headers).status_code == 422
