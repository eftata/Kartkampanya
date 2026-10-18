from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)


class StatementRow(_Camel):
    """Ekstredeki tek harcama satırı (ödeme ve iadeler dahil edilmez)."""

    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    description: str = Field(max_length=120)
    amount_kurus: int = Field(gt=0)
    # "2/6" gibi taksit bilgisi; tutar o taksitin tutarıdır.
    installment: str | None = None


class StatementParseRequest(_Camel):
    # PDF içeriği (base64). Parola yalnızca bu istekte kullanılır, saklanmaz.
    pdf_base64: str = Field(min_length=1, max_length=6_000_000)
    password: str | None = Field(default=None, max_length=100)


class StatementParseResult(_Camel):
    parser: str
    pages: int
    rows: list[StatementRow]
    # Ödeme, iade ve toplam satırları gibi harcama sayılmayan satırlar.
    skipped_credits: int
    # Tarih ve tutar içerse de çözümlenemeyen satırlar (yeni bir banka biçimi olabilir).
    unparsed_lines: int
