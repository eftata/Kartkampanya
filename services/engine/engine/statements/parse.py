import base64
import binascii

from engine.statements.extract import StatementError, extract_lines
from engine.statements.models import StatementParseResult
from engine.statements.parsers import pick_parser


def parse_statement(pdf_base64: str, password: str | None = None) -> StatementParseResult:
    try:
        data = base64.b64decode(pdf_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise StatementError("invalid") from error
    lines, pages = extract_lines(data, password)
    parser = pick_parser(lines)
    rows, skipped, unparsed = parser.parse(lines)
    return StatementParseResult(
        parser=parser.name,
        pages=pages,
        rows=rows,
        skipped_credits=skipped,
        unparsed_lines=unparsed,
    )
