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


@lru_cache
def get_settings() -> Settings:
    return Settings()
