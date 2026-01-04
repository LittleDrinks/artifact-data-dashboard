from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Dict, List

import pandas as pd


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".svg"}


def iter_image_files(images_dir: Path) -> List[Path]:
    files: List[Path] = []
    for p in images_dir.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in IMAGE_EXTS:
            continue
        files.append(p)
    files.sort(key=lambda x: str(x).lower())
    return files


def infer_artifact_id(images_dir: Path, file_path: Path) -> str | None:
    try:
        rel = file_path.relative_to(images_dir)
    except ValueError:
        return None

    parts = rel.parts
    if len(parts) < 2:
        return None

    folder = parts[0]
    # 深圳站点的 ID 都是纯数字；这里强制一下，避免误把别的目录当成 artifact
    if not re.fullmatch(r"\d+", folder):
        return None
    return folder


def build_rows(images_dir: Path) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    for fp in iter_image_files(images_dir):
        artifact_id = infer_artifact_id(images_dir, fp)
        if not artifact_id:
            continue

        rel = fp.relative_to(images_dir).as_posix()
        rows.append(
            {
                "artifact_id": artifact_id,
                # 后端 /api/attachments/excel/link-import 支持按“附件ID”或“引用字符串”匹配。
                # 我们走更稳的“相对路径”模式：artifactId/filename。
                # 需要配合后端 import-dir 在 meta.source.relativePath 写入同样的值。
                "file_reference": rel,
                # 方便人工排查（后端会忽略此列）
                "original_name": fp.name,
            }
        )
    return rows


def write_xlsx(rows: List[Dict[str, str]], output_xlsx: Path) -> None:
    output_xlsx.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows, columns=["artifact_id", "file_reference", "original_name"])

    with pd.ExcelWriter(output_xlsx, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="ArtifactAttachments", index=False)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "从 build_kg/crawler/images_shenzhen 生成文物-图片关联 Excel（ArtifactAttachments），"
            "用于后端 /api/attachments/excel/link-import 接口。"
        )
    )
    parser.add_argument(
        "--images-dir",
        type=str,
        default=str(Path(__file__).parent / "images_shenzhen"),
        help="图片根目录（默认 build_kg/crawler/images_shenzhen）",
    )
    parser.add_argument(
        "--output-xlsx",
        type=str,
        default=str(Path(__file__).parent / "artifact_attachments.xlsx"),
        help="输出 XLSX 路径（默认 build_kg/crawler/artifact_attachments.xlsx）",
    )

    args = parser.parse_args()

    images_dir = Path(args.images_dir)
    if not images_dir.exists():
        raise FileNotFoundError(f"找不到图片目录：{images_dir}")

    rows = build_rows(images_dir)
    if not rows:
        raise RuntimeError(f"未扫描到任何图片（目录：{images_dir}）")

    output_xlsx = Path(args.output_xlsx)
    write_xlsx(rows, output_xlsx)

    artifact_count = len({r["artifact_id"] for r in rows})
    print(f"OK: artifacts={artifact_count} images={len(rows)} -> {output_xlsx}")


if __name__ == "__main__":
    main()
