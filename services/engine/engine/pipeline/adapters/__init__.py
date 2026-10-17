"""Banka adaptörleri. Her adaptör `@register` ile kaydolur; çalıştırıcı adıyla bulur."""

from engine.pipeline.adapters.base import BankAdapter, RawCampaign

ADAPTERS: dict[str, type[BankAdapter]] = {}


def register[T: type[BankAdapter]](cls: T) -> T:
    if cls.adapter in ADAPTERS:
        raise ValueError(f"Adaptör iki kez kaydedildi: {cls.adapter}")
    ADAPTERS[cls.adapter] = cls
    return cls


def get_adapter(name: str) -> BankAdapter:
    try:
        return ADAPTERS[name]()
    except KeyError:
        raise KeyError(f"Bilinmeyen adaptör: {name}") from None


__all__ = ["ADAPTERS", "BankAdapter", "RawCampaign", "get_adapter", "register"]
