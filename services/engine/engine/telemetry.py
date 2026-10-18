"""Hata takibi (Sentry; ADR 0022). Kişisel ya da finansal veri gönderilmez.

İstek gövdesi (plan isteğindeki harcama tutarları), yerel değişkenler, başlıklar ve kullanıcı
bilgisi olaylara eklenmez; mesajlardaki e-posta adresleri ve uzun rakam dizileri silinir.
"""

import re

import sentry_sdk
from sentry_sdk.types import Event, Hint

from engine.settings import Settings

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_LONG_NUMBER = re.compile(r"\b\d(?:[ -]?\d){11,}\b")


def scrub_text(text: str) -> str:
    return _LONG_NUMBER.sub("[sayı]", _EMAIL.sub("[e-posta]", text))


def scrub_event(event: Event, _hint: Hint) -> Event:
    event.pop("user", None)
    request = event.get("request")
    if request is not None:
        url = request.get("url")
        event["request"] = {"url": url} if url else {}
    message = event.get("message")
    if isinstance(message, str):
        event["message"] = scrub_text(message)
    logentry = event.get("logentry")
    if logentry is not None:
        log_message = logentry.get("message")
        if isinstance(log_message, str):
            event["logentry"] = {**logentry, "message": scrub_text(log_message)}
    for exception in (event.get("exception") or {}).get("values") or []:
        value = exception.get("value")
        if isinstance(value, str):
            exception["value"] = scrub_text(value)
    return event


def init_sentry(settings: Settings) -> bool:
    """DSN tanımlıysa Sentry'yi başlatır; başlatıldıysa True."""
    if not settings.sentry_dsn:
        return False
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        send_default_pii=False,
        traces_sample_rate=0.0,
        include_local_variables=False,
        max_request_body_size="never",
        before_send=scrub_event,
    )
    return True
