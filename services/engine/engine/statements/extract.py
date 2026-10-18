"""PDF → metin satırları (pypdf). Hata kodları web'de Türkçe mesaja çevrilir."""

import io
from typing import Literal

from pypdf import PdfReader
from pypdf.errors import FileNotDecryptedError, PdfReadError

MAX_PDF_BYTES = 4 * 1024 * 1024
MAX_PAGES = 30

ErrorCode = Literal["invalid", "too_large", "too_many_pages", "password_required", "wrong_password"]


class StatementError(Exception):
    def __init__(self, code: ErrorCode) -> None:
        super().__init__(code)
        self.code: ErrorCode = code


def extract_lines(data: bytes, password: str | None = None) -> tuple[list[str], int]:
    """(satırlar, sayfa sayısı). Boş satırlar atılır, boşluklar sadeleştirilir."""
    if len(data) > MAX_PDF_BYTES:
        raise StatementError("too_large")
    if not data.startswith(b"%PDF-"):
        raise StatementError("invalid")
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            if not password:
                # Bazı PDF'ler boş parolayla şifrelidir.
                if not reader.decrypt(""):
                    raise StatementError("password_required")
            elif not reader.decrypt(password):
                raise StatementError("wrong_password")
        if len(reader.pages) > MAX_PAGES:
            raise StatementError("too_many_pages")
        lines: list[str] = []
        for page in reader.pages:
            text = page.extract_text() or ""
            lines.extend(" ".join(line.split()) for line in text.splitlines())
    except FileNotDecryptedError as error:
        raise StatementError("password_required") from error
    except (PdfReadError, ValueError, KeyError, TypeError) as error:
        raise StatementError("invalid") from error
    return [line for line in lines if line], len(reader.pages)
