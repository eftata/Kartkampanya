from functools import lru_cache
from pathlib import Path

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
