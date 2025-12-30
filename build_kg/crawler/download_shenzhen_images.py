from __future__ import annotations

import argparse
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests


BASE_URL = "https://www.shenzhenmuseum.com"


def safe_filename(name: str) -> str:
    name = name.strip().replace("\\", "_").replace("/", "_")
    name = re.sub(r"[^a-zA-Z0-9._\-\u4e00-\u9fff]+", "_", name)
    return name[:180] if len(name) > 180 else name


def normalise_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def ensure_full_url(path_or_url: str) -> str:
    if not path_or_url:
        return ""
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        return path_or_url
    if not path_or_url.startswith("/"):
        path_or_url = "/" + path_or_url
    return BASE_URL + path_or_url


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


@dataclass
class ImageTask:
    artifact_id: str
    artifact_name: str
    url: str
    filename: str


def iter_image_tasks(raw: Dict[str, Any]) -> Iterable[ImageTask]:
    for artifact_id, item in raw.items():
        if not isinstance(item, dict):
            continue

        artifact_id_str = str(artifact_id)
        artifact_name = normalise_whitespace(str(item.get("name") or ""))
        images = item.get("contentImageList")

        if not isinstance(images, list):
            continue

        for idx, img in enumerate(images):
            if not isinstance(img, dict):
                continue

            path = str(img.get("path") or "").strip()
            if not path:
                continue

            url = ensure_full_url(path)
            # 优先用接口返回的 name，否则从 path 推导
            raw_name = str(img.get("name") or "").strip()
            if raw_name:
                filename = raw_name
            else:
                filename = Path(path).name or f"image_{idx}.jpg"

            yield ImageTask(
                artifact_id=artifact_id_str,
                artifact_name=artifact_name,
                url=url,
                filename=filename,
            )


def download_one(
    session: requests.Session,
    task: ImageTask,
    out_dir: Path,
    timeout: int,
    retries: int,
    sleep_seconds: float,
) -> Tuple[bool, str]:
    artifact_folder = out_dir / safe_filename(task.artifact_id)
    artifact_folder.mkdir(parents=True, exist_ok=True)

    # 文件名里带上文物名称前缀，便于人工查看
    prefix = safe_filename(task.artifact_name) if task.artifact_name else ""
    base_name = safe_filename(task.filename)
    if prefix:
        final_name = f"{prefix}__{base_name}"
    else:
        final_name = base_name

    target_path = artifact_folder / final_name
    if target_path.exists() and target_path.stat().st_size > 0:
        return True, str(target_path)

    last_error: Optional[str] = None
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(task.url, stream=True, timeout=timeout)
            resp.raise_for_status()

            content_type = (resp.headers.get("Content-Type") or "").lower()
            if content_type and ("image" not in content_type):
                last_error = f"unexpected content-type: {content_type}"
                resp.close()
                raise RuntimeError(last_error)

            tmp_path = target_path.with_suffix(target_path.suffix + ".part")
            with tmp_path.open("wb") as f:
                for chunk in resp.iter_content(chunk_size=1024 * 128):
                    if chunk:
                        f.write(chunk)
            tmp_path.replace(target_path)

            if sleep_seconds > 0:
                time.sleep(sleep_seconds)

            return True, str(target_path)
        except Exception as exc:
            last_error = str(exc)
            if attempt < retries:
                time.sleep(min(2.0 * attempt, 8.0))
                continue
            return False, last_error or "unknown error"


def main() -> None:
    parser = argparse.ArgumentParser(description="下载深圳博物馆藏品图片到本地（从 build_kg/crawler/artifact.json 的 contentImageList 读取）。")
    parser.add_argument(
        "--input-json",
        type=str,
        default=str(Path(__file__).parent / "artifact.json"),
        help="深圳藏品原始 JSON（默认 build_kg/crawler/artifact.json）",
    )
    parser.add_argument(
        "--out-dir",
        type=str,
        default=str(Path(__file__).parent / "images_shenzhen"),
        help="图片输出目录（默认 build_kg/crawler/images_shenzhen）",
    )
    parser.add_argument("--limit-artifacts", type=int, default=0, help="只处理前 N 个文物（0 表示全部）")
    parser.add_argument("--limit-images", type=int, default=0, help="只下载前 N 张图片（0 表示全部）")
    parser.add_argument("--timeout", type=int, default=30, help="单个请求超时秒数")
    parser.add_argument("--retries", type=int, default=3, help="失败重试次数")
    parser.add_argument("--sleep", type=float, default=0.2, help="每张图片下载后的延迟（秒）")

    args = parser.parse_args()

    input_path = Path(args.input_json)
    if not input_path.exists():
        raise FileNotFoundError(f"找不到输入 JSON：{input_path}（请先运行 main.py 生成 artifact.json）")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    raw = load_json(input_path)

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Referer": "https://www.shenzhenmuseum.com/wwk/collection",
        }
    )

    processed_artifacts = 0
    downloaded = 0
    skipped_or_existing = 0
    failed = 0

    # 为了支持 limit-artifacts：先取 artifact_id 顺序
    artifact_ids: List[str] = [str(k) for k in raw.keys()]
    if args.limit_artifacts and args.limit_artifacts > 0:
        allowed = set(artifact_ids[: args.limit_artifacts])
    else:
        allowed = None

    for task in iter_image_tasks(raw):
        if allowed is not None and task.artifact_id not in allowed:
            continue

        ok, info = download_one(
            session=session,
            task=task,
            out_dir=out_dir,
            timeout=args.timeout,
            retries=args.retries,
            sleep_seconds=args.sleep,
        )
        if ok:
            if info.endswith(('.jpg','.jpeg','.png','.webp','.gif','.bmp','.tif','.tiff')):
                downloaded += 1
            else:
                skipped_or_existing += 1
        else:
            failed += 1

        if args.limit_images and args.limit_images > 0 and (downloaded + skipped_or_existing + failed) >= args.limit_images:
            break

    print(
        "OK: "
        f"downloaded={downloaded} existing_or_skipped={skipped_or_existing} failed={failed} "
        f"-> {out_dir}"
    )


if __name__ == "__main__":
    main()
