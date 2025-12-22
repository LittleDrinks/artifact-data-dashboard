from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from convert_artifact_to_excel import NODE_SHEETS, RELATION_SHEETS, write_workbook


EXPECTED_SHEETS: List[str] = [name for name, _ in NODE_SHEETS + RELATION_SHEETS]


def strip_html(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", text)


def normalise_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def parse_dimensions_from_text(text: str) -> List[Tuple[str, str, str]]:
    """从类似 '通高39.5厘米 口径29.4厘米 底径24.6厘米' 中尽量解析尺寸。

    返回: [(label, value, unit)]
    """
    if not text:
        return []

    text = normalise_whitespace(text)
    results: List[Tuple[str, str, str]] = []

    # 常见单位：厘米/毫米/米/千克/克
    pattern = re.compile(r"([\u4e00-\u9fff]{1,6})\s*([0-9]+(?:\.[0-9]+)?)\s*(厘米|毫米|米|千克|克)")
    for m in pattern.finditer(text):
        label = m.group(1)
        value = m.group(2)
        unit = m.group(3)
        results.append((label, value, unit))

    return results


@dataclass
class SheetPayload:
    rows: Dict[str, List[Dict[str, Any]]]

    @classmethod
    def empty(cls) -> "SheetPayload":
        return cls({name: [] for name in EXPECTED_SHEETS})


def add_unique_by_key(existing: Dict[str, Dict[str, Any]], key: str, row: Dict[str, Any]) -> None:
    if not key:
        return
    if key in existing:
        return
    existing[key] = row


def build_payload_from_shenzhen(raw: Dict[str, Any], payload: SheetPayload) -> None:
    categories: Dict[str, Dict[str, Any]] = {}
    eras: Dict[str, Dict[str, Any]] = {}
    locations: Dict[str, Dict[str, Any]] = {}
    dimensions: Dict[str, Dict[str, Any]] = {}

    rel_has_category: Set[Tuple[str, str]] = set()
    rel_belongs_to_era: Set[Tuple[str, str]] = set()
    rel_stored_at: Set[Tuple[str, str]] = set()
    rel_has_dimension: Set[Tuple[str, str]] = set()

    shenzhen_location = "深圳博物馆"
    add_unique_by_key(locations, shenzhen_location, {"name": shenzhen_location, "region": "深圳", "longitude": "", "latitude": ""})

    for artifact_id, item in raw.items():
        if not isinstance(item, dict):
            continue
        artifact_id_str = str(artifact_id)
        name = normalise_whitespace(str(item.get("name") or ""))

        description_chunks: List[str] = []
        for key in ("note", "sourceDetail", "deptSizeInfo"):
            v = item.get(key)
            if v:
                description_chunks.append(normalise_whitespace(str(v)))
        explain = strip_html(item.get("explainTxt"))
        if explain:
            description_chunks.append(normalise_whitespace(explain))

        category_name = normalise_whitespace(str(item.get("categoryName") or item.get("categoryInfo") or ""))
        era_name = normalise_whitespace(str(item.get("yearStartName") or item.get("yearInfo") or ""))

        tags: List[str] = ["深圳博物馆"]
        if category_name:
            tags.append(category_name)
        if item.get("levelName"):
            tags.append(str(item.get("levelName")))
        if item.get("yearInfo"):
            tags.append(str(item.get("yearInfo")))

        payload.rows["Artifacts"].append(
            {
                "artifact_id": artifact_id_str,
                "name": name,
                "description": "\n".join([c for c in description_chunks if c]),
                "tags": "; ".join([t for t in tags if t]),
                "isCataloged": False,
                "isDigitized": False,
                "needsRepair": False,
            }
        )

        if category_name:
            add_unique_by_key(categories, category_name, {"name": category_name, "description": normalise_whitespace(str(item.get("categoryInfo") or ""))})
            rel_has_category.add((artifact_id_str, category_name))

        if era_name:
            add_unique_by_key(
                eras,
                era_name,
                {
                    "name": era_name,
                    "startYear": str(item.get("yearStart") or ""),
                    "endYear": str(item.get("yearEnd") or ""),
                },
            )
            rel_belongs_to_era.add((artifact_id_str, era_name))

        # 统一给深圳藏品挂载存放地点（博物馆）
        rel_stored_at.add((artifact_id_str, shenzhen_location))

        # 尺寸解析
        dim_text = str(item.get("deptSizeInfo") or "")
        for label, value, unit in parse_dimensions_from_text(dim_text):
            dim_label = f"{label}({value}{unit})"
            add_unique_by_key(dimensions, dim_label, {"label": dim_label, "value": value, "unit": unit})
            rel_has_dimension.add((artifact_id_str, dim_label))

    payload.rows["Categories"].extend(categories.values())
    payload.rows["Eras"].extend(eras.values())
    payload.rows["Locations"].extend(locations.values())
    payload.rows["Dimensions"].extend(dimensions.values())

    payload.rows["REL_HAS_CATEGORY"].extend({"artifact_id": a, "category_name": c} for a, c in sorted(rel_has_category))
    payload.rows["REL_BELONGS_TO_ERA"].extend({"artifact_id": a, "era_name": e} for a, e in sorted(rel_belongs_to_era))
    payload.rows["REL_STORED_AT"].extend({"artifact_id": a, "location_name": l} for a, l in sorted(rel_stored_at))
    payload.rows["REL_HAS_DIMENSION"].extend({"artifact_id": a, "dimension_label": d} for a, d in sorted(rel_has_dimension))


def build_payload_from_palace(palace_payload: Dict[str, Any], payload: SheetPayload) -> None:
    categories: Dict[str, Dict[str, Any]] = {}
    eras: Dict[str, Dict[str, Any]] = {}
    locations: Dict[str, Dict[str, Any]] = {}

    rel_has_category: Set[Tuple[str, str]] = set()
    rel_belongs_to_era: Set[Tuple[str, str]] = set()
    rel_stored_at: Set[Tuple[str, str]] = set()

    palace_location = "故宫博物院"
    add_unique_by_key(locations, palace_location, {"name": palace_location, "region": "北京", "longitude": "", "latitude": ""})

    artifacts = palace_payload.get("artifacts") or []
    if not isinstance(artifacts, list):
        return

    for item in artifacts:
        if not isinstance(item, dict):
            continue
        artifact_id = str(item.get("artifact_id") or "").strip()
        if not artifact_id:
            continue

        name = normalise_whitespace(str(item.get("name") or ""))
        number = normalise_whitespace(str(item.get("number") or ""))
        category = normalise_whitespace(str(item.get("category") or ""))
        era = normalise_whitespace(str(item.get("era") or ""))
        color = normalise_whitespace(str(item.get("color") or ""))
        detail_url = str(item.get("detailUrl") or "").strip()

        description_parts: List[str] = ["来源：故宫博物院"]
        if number:
            description_parts.append(f"编号：{number}")
        if color:
            description_parts.append(f"颜色：{color}")
        if detail_url:
            description_parts.append(f"链接：{detail_url}")

        tags: List[str] = ["故宫博物院"]
        if category:
            tags.append(category)
        if era:
            tags.append(era)
        if number:
            tags.append(number)

        payload.rows["Artifacts"].append(
            {
                "artifact_id": artifact_id,
                "name": name,
                "description": "\n".join(description_parts),
                "tags": "; ".join([t for t in tags if t]),
                "isCataloged": False,
                "isDigitized": False,
                "needsRepair": False,
            }
        )

        if category:
            add_unique_by_key(categories, category, {"name": category, "description": ""})
            rel_has_category.add((artifact_id, category))

        if era:
            add_unique_by_key(eras, era, {"name": era, "startYear": "", "endYear": ""})
            rel_belongs_to_era.add((artifact_id, era))

        rel_stored_at.add((artifact_id, palace_location))

    payload.rows["Categories"].extend(categories.values())
    payload.rows["Eras"].extend(eras.values())
    payload.rows["Locations"].extend(locations.values())

    payload.rows["REL_HAS_CATEGORY"].extend({"artifact_id": a, "category_name": c} for a, c in sorted(rel_has_category))
    payload.rows["REL_BELONGS_TO_ERA"].extend({"artifact_id": a, "era_name": e} for a, e in sorted(rel_belongs_to_era))
    payload.rows["REL_STORED_AT"].extend({"artifact_id": a, "location_name": l} for a, l in sorted(rel_stored_at))


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="合并深圳博物馆 + 故宫博物院数据，并导出符合 build_kg/data.xlsx 模板的 Excel。")
    parser.add_argument(
        "--shenzhen-json",
        type=str,
        default=str(Path("build_kg/crawler/artifact.json")),
        help="深圳博物馆原始 JSON（默认 build_kg/crawler/artifact.json）",
    )
    parser.add_argument(
        "--palace-json",
        type=str,
        default=str(Path("build_kg/crawler/palace_museum_artifacts.json")),
        help="故宫爬虫输出 JSON（默认 build_kg/crawler/palace_museum_artifacts.json）",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(Path("build_kg/data_merged.xlsx")),
        help="输出 Excel（默认 build_kg/data_merged.xlsx）",
    )

    args = parser.parse_args()

    shenzhen_path = Path(args.shenzhen_json)
    palace_path = Path(args.palace_json)
    output_path = Path(args.output)

    if not shenzhen_path.exists():
        raise FileNotFoundError(f"找不到深圳 JSON: {shenzhen_path}")
    if not palace_path.exists():
        raise FileNotFoundError(f"找不到故宫 JSON: {palace_path}（请先运行 palace_museum_web_crawler.py）")

    shenzhen_raw = load_json(shenzhen_path)
    palace_raw = load_json(palace_path)

    payload = SheetPayload.empty()
    build_payload_from_shenzhen(shenzhen_raw, payload)
    build_payload_from_palace(palace_raw, payload)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_workbook(payload.rows, output_path)

    print(f"OK: exported -> {output_path}")


if __name__ == "__main__":
    main()
