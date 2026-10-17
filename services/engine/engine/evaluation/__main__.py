"""Ayıklama doğruluğu (ADR 0013).

    python -m engine.evaluation export [--status APPROVED] [--limit 30] [--force]
    python -m engine.evaluation run      # Claude API çağırır (ücretli), predictions.jsonl yazar
    python -m engine.evaluation score    # predictions.jsonl'i yeniden puanlar (API çağırmaz)

Set `services/engine/eval/` altındadır (`--dir` ile değişir). `run` ve `score` raporu
`eval/report.md`'ye yazar. Çıkış kodu: 0 = hedef tuttu, 1 = tutmadı, 2 = set boş / eksik.
"""

import argparse
import asyncio
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from engine.evaluation.dataset import load_cases, load_catalog
from engine.evaluation.evaluate import (
    export_cases,
    predict,
    read_predictions,
    score_all,
    write_predictions,
)
from engine.evaluation.report import percent, render
from engine.evaluation.score import TARGET, summarize
from engine.pipeline.extract import anthropic_llm
from engine.pipeline.store import CampaignStore, connect
from engine.settings import get_settings

DEFAULT_DIR = Path(__file__).resolve().parents[2] / "eval"


async def export(args: argparse.Namespace) -> int:
    async with connect(get_settings()) as conn:
        result = await export_cases(
            CampaignStore(conn), args.dir, status=args.status, limit=args.limit, force=args.force
        )
    print(f"Yazılan: {len(result.written)} · var olan (ezilmedi): {len(result.skipped)}")
    for cid in result.invalid:
        print(f"Atlandı (katalogda olmayan kategori/marka ya da geçersiz kural): {cid}")
    return 0


async def evaluate(args: argparse.Namespace, *, call_llm: bool) -> int:
    if not (args.dir / "catalog.json").exists():
        print(f"{args.dir}/catalog.json yok: önce `export` çalıştır.", file=sys.stderr)
        return 2
    catalog = load_catalog(args.dir)
    cases = [case for case in load_cases(args.dir, catalog) if not case.synthetic]
    if not cases:
        print("Değerlendirilecek vaka yok (sentetik vakalar sayılmaz).", file=sys.stderr)
        return 2

    predictions_path = args.dir / "predictions.jsonl"
    if call_llm:
        predictions = await predict(cases, catalog, anthropic_llm(get_settings()))
        write_predictions(predictions_path, predictions)
    elif predictions_path.exists():
        predictions = read_predictions(predictions_path)
    else:
        print("predictions.jsonl yok: önce `run` çalıştır.", file=sys.stderr)
        return 2

    scores = score_all(cases, predictions)
    summary = summarize(scores)
    models = Counter(p.model for p in predictions if p.model)
    report = render(
        summary,
        scores,
        cases,
        model=models.most_common(1)[0][0] if models else None,
        today=datetime.now(UTC).date(),
    )
    args.report.write_text(report, encoding="utf-8")
    print(
        f"{summary.cases} vaka · eşik ve ödül alanları {percent(summary.headline)} "
        f"(hedef {percent(TARGET)}) · rapor: {args.report}"
    )
    return 0 if summary.passed else 1


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="python -m engine.evaluation")
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    commands = parser.add_subparsers(dest="command", required=True)
    exp = commands.add_parser("export", help="onaylı kampanyalardan vaka yaz")
    exp.add_argument("--status", default="APPROVED", choices=["APPROVED", "DRAFT", "REJECTED"])
    exp.add_argument("--limit", type=int, default=30)
    exp.add_argument("--force", action="store_true", help="var olan vaka dosyalarını ez")
    for name in ("run", "score"):
        sub = commands.add_parser(name)
        sub.add_argument("--report", type=Path, default=None)
    args = parser.parse_args(argv)
    if args.command == "export":
        return asyncio.run(export(args))
    args.report = args.report or args.dir / "report.md"
    return asyncio.run(evaluate(args, call_llm=args.command == "run"))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
