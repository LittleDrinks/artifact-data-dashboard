from __future__ import annotations

import argparse
import json
import random
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup


LIST_API_PRIMARY = "https://digicol.dpm.org.cn/cultural/queryList"
LIST_API_FALLBACK = "https://zm-digicol.dpm.org.cn/cultural/queryList"
DETAIL_PAGE = "https://digicol.dpm.org.cn/cultural/detail"


def has_cjk(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text or ""))


def normalise_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def safe_filename(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", name)


@dataclass
class PalaceArtifact:
    artifact_id: str
    uuid: str
    name: str
    number: str
    category: str
    era: str
    color: str
    has_image: bool
    detail_url: str
    raw_pairs: Dict[str, str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "artifact_id": self.artifact_id,
            "uuid": self.uuid,
            "name": self.name,
            "number": self.number,
            "category": self.category,
            "era": self.era,
            "color": self.color,
            "hasImage": self.has_image,
            "detailUrl": self.detail_url,
            "rawPairs": self.raw_pairs,
            "sourceMuseum": "故宫博物院",
            "source": {
                "list_api_primary": LIST_API_PRIMARY,
                "list_api_fallback": LIST_API_FALLBACK,
                "detail_page": DETAIL_PAGE,
            },
        }


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            # digicol 域名在部分网络环境下更稳定（zm-digicol 可能触发 WAF 403）
            "Origin": "https://digicol.dpm.org.cn",
            "Referer": "https://digicol.dpm.org.cn/cultural/list",
            "Content-Type": "application/json;charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
        }
    )
    return session


def post_json(session: requests.Session, url: str, payload: Dict[str, Any], timeout: int = 30) -> Dict[str, Any]:
    resp = session.post(url, json=payload, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def fetch_list_json(session: requests.Session, payload: Dict[str, Any], timeout: int = 30) -> Dict[str, Any]:
    """列表接口优先走 digicol，其次回退 zm-digicol。"""
    try:
        return post_json(session, LIST_API_PRIMARY, payload, timeout=timeout)
    except requests.HTTPError as exc:
        status = getattr(exc.response, "status_code", None)
        if status == 403:
            return post_json(session, LIST_API_FALLBACK, payload, timeout=timeout)
        raise


def get_html(session: requests.Session, url: str, params: Dict[str, Any], timeout: int = 30) -> str:
    resp = session.get(url, params=params, timeout=timeout)
    resp.raise_for_status()
    # 服务端返回头是 UTF-8，但保险起见强制 UTF-8
    resp.encoding = "utf-8"
    return resp.text


def parse_detail_pairs(html: str) -> Tuple[str, Dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    title = soup.find("h2")
    name = normalise_whitespace(title.get_text(" ", strip=True)) if title else ""

    # 页面里常见结构：<ul><li><span>Number</span><font>故001...</font></li>...</ul>
    pairs: Dict[str, str] = {}
    for ul in soup.find_all("ul"):
        li_items = ul.find_all("li")
        if not li_items:
            continue
        span_font_pairs: List[Tuple[str, str]] = []
        for li in li_items:
            sp = li.find("span")
            ft = li.find("font")
            if not sp or not ft:
                continue
            k = normalise_whitespace(sp.get_text(" ", strip=True))
            v = normalise_whitespace(ft.get_text(" ", strip=True))
            if k:
                span_font_pairs.append((k, v))
        # 选包含 Number/Category/Period 的那个块
        keys = {k for k, _ in span_font_pairs}
        if {"Number", "Category", "Period"}.intersection(keys):
            for k, v in span_font_pairs:
                if k and v is not None:
                    pairs[k] = v
            break

    return name, pairs


def fetch_one_artifact(
    session: requests.Session,
    uuid: str,
    list_row: Dict[str, Any],
    sleep_seconds: float = 0.25,
) -> PalaceArtifact:
    html = get_html(session, DETAIL_PAGE, {"id": uuid, "source": 6})
    name_from_detail, pairs = parse_detail_pairs(html)

    name = name_from_detail or normalise_whitespace(str(list_row.get("name") or ""))
    era = normalise_whitespace(str(list_row.get("dynastyName") or "")) or pairs.get("Period", "")
    category = pairs.get("Category", "")
    number = pairs.get("Number", "") or normalise_whitespace(str(list_row.get("culturalRelicNo") or ""))
    color = pairs.get("Color", "")
    has_image = bool(list_row.get("hasImage"))

    artifact_id = f"PM_{uuid}"  # 防止与深圳数字ID冲突

    if sleep_seconds > 0:
        time.sleep(sleep_seconds)

    return PalaceArtifact(
        artifact_id=artifact_id,
        uuid=uuid,
        name=name,
        number=number,
        category=category,
        era=era,
        color=color,
        has_image=has_image,
        detail_url=f"{DETAIL_PAGE}?id={uuid}&source=6",
        raw_pairs=pairs,
    )


def iter_list_rows(session: requests.Session, page_size: int = 50, start_page: int = 1) -> Iterable[Dict[str, Any]]:
    page = start_page
    while True:
        payload = {
            "page": page,
            "pageSize": page_size,
            "keyWord": "",
            "cateList": [],
            "dynastys": [],
            "sortType": 0,
            "hasMhj": 0,
            "hasDbg": 0,
            # ranNum 在前端代码里出现过，疑似防缓存/风控参数
            "ranNum": random.randint(0, 10_000_000),
        }
        data = fetch_list_json(session, payload)
        rows = data.get("rows") or []
        if not isinstance(rows, list) or not rows:
            return
        for row in rows:
            if isinstance(row, dict):
                yield row
        page += 1


def crawl(limit: int, page_size: int, start_page: int, sleep_seconds: float) -> List[Dict[str, Any]]:
    session = build_session()

    results: List[Dict[str, Any]] = []
    seen_uuid: set[str] = set()

    for row in iter_list_rows(session, page_size=page_size, start_page=start_page):
        uuid = str(row.get("uuid") or "").strip()
        if not uuid or uuid in seen_uuid:
            continue

        # 只要中文数据：名称至少包含一个 CJK 字符
        name = normalise_whitespace(str(row.get("name") or ""))
        if not has_cjk(name):
            continue

        seen_uuid.add(uuid)
        try:
            artifact = fetch_one_artifact(session, uuid, row, sleep_seconds=sleep_seconds)
        except Exception as exc:
            # 跳过失败项，继续爬下一条
            continue

        # 再次确认名称中文
        if not has_cjk(artifact.name):
            continue

        results.append(artifact.to_dict())
        if len(results) >= limit:
            break

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="故宫博物院（数字文物库）网页端爬虫：抓取藏品总目列表 + 详情页字段（HTML解析）。")
    parser.add_argument("--limit", type=int, default=100, help="抓取条数（默认 100）")
    parser.add_argument("--page-size", type=int, default=50, help="列表接口分页大小（默认 50）")
    parser.add_argument("--start-page", type=int, default=1, help="从第几页开始（默认 1）")
    parser.add_argument("--sleep", type=float, default=0.25, help="每条详情请求后的 sleep 秒数（默认 0.25）")
    parser.add_argument(
        "--output",
        type=str,
        default=str(Path(__file__).parent / "palace_museum_artifacts.json"),
        help="输出 JSON 路径（默认 build_kg/crawler/palace_museum_artifacts.json）",
    )

    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    artifacts = crawl(limit=args.limit, page_size=args.page_size, start_page=args.start_page, sleep_seconds=args.sleep)

    payload = {
        "meta": {
            "sourceMuseum": "故宫博物院",
            "limit": args.limit,
            "pageSize": args.page_size,
            "startPage": args.start_page,
            "sleepSeconds": args.sleep,
            "fetched": len(artifacts),
            "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
            "listApiPrimary": LIST_API_PRIMARY,
            "listApiFallback": LIST_API_FALLBACK,
        },
        "artifacts": artifacts,
    }

    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: wrote {len(artifacts)} artifacts -> {output_path}")


if __name__ == "__main__":
    main()
