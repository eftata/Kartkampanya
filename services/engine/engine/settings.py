from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Yerelde değişkenler monorepo kökündeki .env'den okunur (services/engine/engine/settings.py ->
# 3 üst klasör). Docker imajında bu klasör yoktur; değişkenler doğrudan ortamdan gelir.
_PARENTS = Path(__file__).resolve().parents
_ROOT_ENV = _PARENTS[3] / ".env" if len(_PARENTS) > 3 else None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ROOT_ENV, extra="ignore")

    # Web sunucusu ile paylaşılan gizli anahtar. Boşsa korumalı uçlar hiçbir isteği kabul etmez.
    engine_token: SecretStr = Field(default=SecretStr(""))

    # Kampanya veri hattı. Üretimde User-Agent'a iletişim adresi eklenmeli (bankalar kimin
    # taradığını görebilsin). İstekler arası bekleme 2 sn'nin altına indirilemez.
    pipeline_user_agent: str = "KartPlanBot/0.1"
    pipeline_min_delay_seconds: float = Field(default=2.0, ge=2.0)

    # LLM ayıklama (ADR 0010). Anahtar yoksa ayıklama çalışmaz; tarama ve değişiklik tespiti
    # yine de çalışır.
    anthropic_api_key: SecretStr = Field(default=SecretStr(""))
    llm_model: str = "claude-opus-5-5"

    # Veri hattının yazdığı veritabanı (web ile aynı). Prisma biçimindeki "?schema=" parametresi
    # psycopg'ye uygun hale `postgres_dsn` ile çevrilir.
    database_url: SecretStr = Field(default=SecretStr(""))

    def postgres_dsn(self) -> tuple[str, str]:
        """(psycopg bağlantı adresi, şema adı). Prisma'nın `schema` parametresi ayrılır."""
        url = self.database_url.get_secret_value()
        if not url:
            raise RuntimeError("DATABASE_URL tanımlı değil.")
        parts = urlsplit(url)
        query = parse_qsl(parts.query, keep_blank_values=True)
        schema = next((value for key, value in query if key == "schema"), "public")
        rest = urlencode([(key, value) for key, value in query if key != "schema"])
        return urlunsplit((parts.scheme, parts.netloc, parts.path, rest, parts.fragment)), schema


@lru_cache
def get_settings() -> Settings:
    return Settings()
