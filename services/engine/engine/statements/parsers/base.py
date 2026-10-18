from abc import ABC, abstractmethod
from typing import ClassVar

from engine.statements.models import StatementRow


class StatementParser(ABC):
    name: ClassVar[str]

    @classmethod
    def detect(cls, lines: list[str]) -> bool:
        """Bu ekstre bu ayrıştırıcıya mı ait (ör. banka adı başlıkta)."""
        return False

    @abstractmethod
    def parse(self, lines: list[str]) -> tuple[list[StatementRow], int, int]:
        """(harcama satırları, atlanan ödeme/iade/toplam satırı, çözümlenemeyen satır)."""


PARSERS: list[type[StatementParser]] = []


def register(parser: type[StatementParser]) -> type[StatementParser]:
    PARSERS.append(parser)
    return parser


def pick_parser(lines: list[str]) -> StatementParser:
    from engine.statements.parsers.generic import GenericParser

    for parser in PARSERS:
        if parser.detect(lines):
            return parser()
    return GenericParser()
