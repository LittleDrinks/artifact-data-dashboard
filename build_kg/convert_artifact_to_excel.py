"""Convert raw artifact JSON into Excel sheets that match README format requirements."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import pandas as pd

NODE_SHEETS: List[Tuple[str, List[str]]] = [
    ("Artifacts", ["artifact_id", "name", "description", "tags", "isCataloged", "isDigitized", "needsRepair"]),
    ("Categories", ["name", "description"]),
    ("Eras", ["name", "startYear", "endYear"]),
    ("Locations", ["name", "region", "longitude", "latitude"]),
    ("Materials", ["name", "description"]),
    ("Dimensions", ["label", "value", "unit"]),
    ("DamageTypes", ["name", "severity", "description"]),
    ("RestorationMethods", ["name", "description"]),
    ("ReinforcementMethods", ["name", "description"]),
    ("InspectionTechniques", ["name", "description"]),
    ("ProtectiveMaterials", ["name", "description"]),
    ("InspectionMetrics", ["name", "unit", "idealRange"]),
]

RELATION_SHEETS: List[Tuple[str, List[str]]] = [
    ("REL_HAS_CATEGORY", ["artifact_id", "category_name"]),
    ("REL_BELONGS_TO_ERA", ["artifact_id", "era_name"]),
    ("REL_STORED_AT", ["artifact_id", "location_name"]),
    ("REL_MADE_OF", ["artifact_id", "material_name"]),
    ("REL_HAS_DIMENSION", ["artifact_id", "dimension_label"]),
    ("REL_HAS_DAMAGE", ["artifact_id", "damage_name"]),
    ("REL_USES_RESTORATION", ["artifact_id", "restoration_name"]),
    ("REL_USES_REINFORCEMENT", ["artifact_id", "reinforcement_name"]),
    ("REL_INSPECTED_BY", ["artifact_id", "technique_name"]),
    ("REL_PROTECTED_WITH", ["artifact_id", "protective_material_name"]),
    ("REL_MEASURED_BY", ["artifact_id", "metric_name"]),
]


def strip_html(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", text)


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def build_frame(rows: Iterable[Dict[str, Any]], columns: List[str]) -> pd.DataFrame:
    materialised: List[Dict[str, Any]] = []
    for item in rows:
        materialised.append({col: item.get(col, "") for col in columns})
    return pd.DataFrame(materialised, columns=columns)


def normalise_cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (list, tuple)):
        return "; ".join(normalise_cell(v) for v in value)
    return str(value)


def derive_export_payload(raw: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    expected_keys = {name for name, _ in NODE_SHEETS + RELATION_SHEETS}
    if any(key in raw for key in expected_keys):
        ensured = {name: [] for name in expected_keys}
        for key, value in raw.items():
            if key in ensured and isinstance(value, list):
                ensured[key] = value
        return ensured

    prepared: Dict[str, List[Dict[str, Any]]] = {name: [] for name in expected_keys}
    category_index: Dict[str, Dict[str, Any]] = {}
    era_index: Dict[str, Dict[str, Any]] = {}

    for artifact_id, payload in raw.items():
        description_chunks: List[str] = []
        for key in ("note", "sourceDetail", "deptSizeInfo"):
            field_value = payload.get(key)
            if field_value:
                description_chunks.append(str(field_value).strip())
        explain_text = strip_html(payload.get("explainTxt"))
        if explain_text:
            description_chunks.append(explain_text.strip())

        tags = [payload.get("categoryName"), payload.get("levelName"), payload.get("yearInfo")]
        tag_string = "; ".join(tag for tag in tags if tag)

        prepared["Artifacts"].append(
            {
                "artifact_id": artifact_id,
                "name": payload.get("name", ""),
                "description": "\n".join(chunk for chunk in description_chunks if chunk),
                "tags": tag_string,
                "isCataloged": False,
                "isDigitized": False,
                "needsRepair": False,
            }
        )

        category_name = payload.get("categoryName") or payload.get("categoryInfo")
        if category_name:
            category_index.setdefault(category_name, {"name": category_name, "description": payload.get("categoryInfo", "") or ""})
            prepared["REL_HAS_CATEGORY"].append({"artifact_id": artifact_id, "category_name": category_name})

        era_name = payload.get("yearStartName") or payload.get("yearInfo")
        if era_name:
            era_entry = era_index.setdefault(
                era_name,
                {
                    "name": era_name,
                    "startYear": payload.get("yearStart", "") or "",
                    "endYear": payload.get("yearEnd", "") or "",
                },
            )
            if payload.get("yearStart") and not era_entry["startYear"]:
                era_entry["startYear"] = payload["yearStart"]
            if payload.get("yearEnd") and not era_entry["endYear"]:
                era_entry["endYear"] = payload["yearEnd"]
            prepared["REL_BELONGS_TO_ERA"].append({"artifact_id": artifact_id, "era_name": era_name})

    prepared["Categories"] = list(category_index.values())
    prepared["Eras"] = list(era_index.values())

    return prepared


def write_workbook(prepared: Dict[str, List[Dict[str, Any]]], output_path: Path) -> None:
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        for sheet_name, columns in NODE_SHEETS + RELATION_SHEETS:
            rows = prepared.get(sheet_name, [])
            frame = build_frame(rows, columns)
            frame = frame.apply(lambda col: col.map(normalise_cell), axis=0)
            frame.to_excel(writer, sheet_name=sheet_name[:31], index=False)


def main(input_path: str, output_path: str) -> None:
    source = Path(input_path)
    if not source.exists():
        raise FileNotFoundError(f"无法找到输入文件: {source}")

    raw_payload = load_json(source)
    prepared_payload = derive_export_payload(raw_payload)
    write_workbook(prepared_payload, Path(output_path))
    print(f"转换完成: {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("用法: python convert_artifact_to_excel.py <artifact.json路径> <输出excel路径>")
        sys.exit(1)

    main(sys.argv[1], sys.argv[2])
