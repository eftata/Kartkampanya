from typing import Any, cast

from sentry_sdk.types import Event

from engine.settings import Settings
from engine.telemetry import init_sentry, scrub_event, scrub_text


def test_scrub_text_removes_emails_and_long_numbers() -> None:
    assert scrub_text("ali@ornek.com hata") == "[e-posta] hata"
    assert scrub_text("kart 4111 1111 1111 1111") == "kart [sayı]"
    assert scrub_text("2.500 TL 2026-11-30") == "2.500 TL 2026-11-30"


def test_scrub_event_drops_user_body_headers_and_scrubs_messages() -> None:
    event = cast(
        Event,
        {
            "user": {"email": "a@b.com"},
            "request": {
                "url": "https://motor.test/optimize",
                "data": {"budget": [{"category": "market", "amount": 500000}]},
                "headers": {"Authorization": "Bearer gizli"},
            },
            "message": "a@b.com",
            "logentry": {"message": "kart 4111111111111111"},
            "exception": {"values": [{"type": "ValueError", "value": "x@y.org bulunamadı"}]},
        },
    )
    result = cast(dict[str, Any], scrub_event(event, {}))
    assert result == {
        "request": {"url": "https://motor.test/optimize"},
        "message": "[e-posta]",
        "logentry": {"message": "kart [sayı]"},
        "exception": {"values": [{"type": "ValueError", "value": "[e-posta] bulunamadı"}]},
    }


def test_init_sentry_is_noop_without_dsn() -> None:
    assert init_sentry(Settings(sentry_dsn="")) is False
