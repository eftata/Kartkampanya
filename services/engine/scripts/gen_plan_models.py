"""PlanRequest / PlanResponse pydantic modellerini JSON Schema'dan üretir (ADR 0015).

Kaynak: packages/shared/schema/plan-*.schema.json (zod'dan üretilir). zod nullable alanları
`anyOf: [X, {"type": "null"}]` olarak yazar; üretici bunları RootModel sarmalayıcısına çevirir.
Burada anlamı aynı `type: [X, "null"]` biçimine indirgenir; kimlik listelerindeki öğe uzunluk
kısıtı da (yine sarmalayıcı doğurur) yalnızca Python tarafında kaldırılır. Sonra
datamodel-code-generator çalışır.

    pnpm plan:gen   (kök: önce JSON Schema, sonra bu betik)
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = ROOT / "packages/shared/schema"
OUT = ROOT / "services/engine/engine/optimizer/contract"
HEADER = (
    "# Üretilmiş dosya — elle düzenleme. Kaynak: packages/shared/src/plan.ts (ADR 0015).\n"
    "# Yeniden üret: pnpm plan:gen"
)


def simplify(node: Any) -> Any:
    if isinstance(node, list):
        return [simplify(item) for item in node]
    if not isinstance(node, dict):
        return node
    node = {key: simplify(value) for key, value in node.items()}
    items = node.get("items")
    if node.get("type") == "array" and isinstance(items, dict) and items.get("type") == "string":
        # Kimlik listeleri: öğe uzunluk kısıtı üreticide RootModel sarmalayıcısı doğurur. Kısıtı
        # web (zod) zaten uyguluyor; motor kimlikleri yalnızca anahtar olarak kullanır.
        node["items"] = {"type": "string"}
    options = node.get("anyOf")
    if isinstance(options, list) and len(options) == 2 and {"type": "null"} in options:
        other = next(option for option in options if option != {"type": "null"})
        if isinstance(other.get("type"), str) and "$ref" not in other:
            rest = {key: value for key, value in node.items() if key != "anyOf"}
            return {**other, **rest, "type": [other["type"], "null"]}
    return node


def generate(kind: str, out: Path = OUT) -> None:
    schema = json.loads((SCHEMAS / f"plan-{kind}.schema.json").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / f"plan-{kind}.schema.json"
        source.write_text(json.dumps(simplify(schema)), encoding="utf-8")
        subprocess.run(  # noqa: S603 — sabit argümanlar, yerel araç
            [
                sys.executable, "-m", "datamodel_code_generator",
                "--input", str(source),
                "--input-file-type", "jsonschema",
                "--output", str(out / f"{kind}.py"),
                "--output-model-type", "pydantic_v2.BaseModel",
                "--target-python-version", "3.12",
                "--class-name", f"Plan{kind.capitalize()}",
                "--use-standard-collections", "--use-union-operator", "--use-annotated",
                "--field-constraints", "--extra-fields", "forbid", "--disable-timestamp",
                "--use-double-quotes", "--use-schema-description", "--collapse-root-models",
                "--strict-nullable", "--enum-field-as-literal", "all",
                "--formatters", "ruff-format", "ruff-check",
                "--custom-file-header", HEADER,
            ],
            check=True,
        )  # fmt: skip
    # Üretici geçici klasörden çalışınca projenin ruff ayarlarını görmez; biçim burada sabitlenir.
    config = ["--config", str(ROOT / "services/engine/pyproject.toml")]
    target = str(out / f"{kind}.py")
    # UP040 (TypeAliasType → type) ruff'ta "güvensiz" düzeltmedir; üretilen kod için uygundur.
    for args in (["check", "--fix", "--unsafe-fixes", "--quiet"], ["format", "--quiet"]):
        subprocess.run([sys.executable, "-m", "ruff", *args, *config, target], check=True)  # noqa: S603


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for kind in ("request", "response"):
        generate(kind)
