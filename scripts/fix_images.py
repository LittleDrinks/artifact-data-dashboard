"""
Fix artifact images: fetch thumbnails from Wikipedia API and update database.

For each artifact, extract the Wikipedia page title from the stored URL,
call the Wikipedia API to get the page thumbnail, and update image_url.

Features:
- Skips artifacts that already have a valid image URL (not wikipedia article link)
- Retries on 429 rate limit with exponential backoff
- Respects rate limits with per-request delays

Usage:
    cd backend
    source .venv/Scripts/activate
    python ../scripts/fix_images.py
"""

import json
import os
import sqlite3
import sys
import time
from urllib.parse import quote, unquote, urlparse
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# Windows encoding fix
sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "data", "app.db")
API_BASE = "https://zh.wikipedia.org/w/api.php"
REQUEST_DELAY = 2.0  # seconds between individual requests
MAX_RETRIES = 5


def extract_page_title(url: str) -> str | None:
    """Extract Wikipedia page title from URL."""
    if not url or "wikipedia.org" not in url:
        return None
    path = urlparse(url).path
    parts = path.split("/wiki/")
    if len(parts) < 2:
        return None
    return unquote(parts[1])


def fetch_thumbnail(title: str) -> str | None:
    """Fetch thumbnail URL from Wikipedia API for a given page title."""
    url = (
        f"{API_BASE}?action=query"
        f"&titles={quote(title, safe='')}"
        f"&prop=pageimages"
        f"&format=json"
        f"&pithumbsize=400"
    )

    for attempt in range(MAX_RETRIES):
        req = Request(url, headers={"User-Agent": "HeritageDataBot/1.0 (educational project)"})
        try:
            with urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                pages = data.get("query", {}).get("pages", {})
                for page_id, page_data in pages.items():
                    if page_id == "-1":
                        return None
                    return page_data.get("thumbnail", {}).get("source")
                return None
        except HTTPError as e:
            if e.code == 429:
                wait = (2 ** attempt) * 10  # 10s, 20s, 40s, 80s, 160s
                print(f"    [429 rate limited, waiting {wait}s (attempt {attempt+1}/{MAX_RETRIES})]")
                time.sleep(wait)
            else:
                return None
        except (URLError, json.JSONDecodeError, TimeoutError):
            return None

    return None


def main():
    db_path = os.path.abspath(DB_PATH)
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    cursor = conn.cursor()

    # Get all artifacts whose image_url is still a Wikipedia article link
    cursor.execute("SELECT id, name, image_url FROM artifacts ORDER BY id")
    artifacts = cursor.fetchall()
    print(f"Found {len(artifacts)} artifacts total")

    # Filter to only those with Wikipedia article URLs (need fixing)
    needs_fix = []
    already_ok = 0
    for artifact_id, name, image_url in artifacts:
        if image_url and "wikipedia.org/wiki/" in image_url:
            title = extract_page_title(image_url)
            if title:
                needs_fix.append((artifact_id, name, title))
        else:
            already_ok += 1

    print(f"  Already have valid images: {already_ok}")
    print(f"  Need to fetch thumbnails: {len(needs_fix)}")

    if not needs_fix:
        print("Nothing to do!")
        conn.close()
        return

    updated = 0
    no_thumbnail = 0

    for i, (artifact_id, name, title) in enumerate(needs_fix):
        thumb_url = fetch_thumbnail(title)
        if thumb_url:
            cursor.execute(
                "UPDATE artifacts SET image_url = ? WHERE id = ?",
                (thumb_url, artifact_id),
            )
            updated += 1
        else:
            no_thumbnail += 1

        # Commit every 20 records
        if (i + 1) % 20 == 0:
            conn.commit()
            print(f"  Progress: {i+1}/{len(needs_fix)} processed, {updated} updated")

        # Rate limiting
        time.sleep(REQUEST_DELAY)

    conn.commit()
    conn.close()

    print(f"\nDone!")
    print(f"  Updated with real images: {updated}")
    print(f"  No thumbnail available: {no_thumbnail}")
    print(f"  Already had valid images: {already_ok}")


if __name__ == "__main__":
    main()
