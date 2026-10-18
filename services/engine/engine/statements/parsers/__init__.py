"""Ekstre ayrıştırıcıları. Bankaya özel ayrıştırıcı `@register` ile eklenir ve `detect` ile seçilir;
uyan yoksa genel ayrıştırıcı çalışır. Bankaya özel ayrıştırıcı yalnızca o bankanın **gerçek**
(anonimleştirilmiş) ekstresiyle yazılır ve test edilir (ADR 0028)."""

from engine.statements.parsers.base import PARSERS, StatementParser, pick_parser, register

__all__ = ["PARSERS", "StatementParser", "pick_parser", "register"]
