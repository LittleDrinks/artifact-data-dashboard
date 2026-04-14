"""
Fix era and location data: update artifacts from detail JSON files.

Reads artifact detail files from data/artifacts_detail/ and updates
the era and location fields in the database. Falls back to infobox
data if the top-level era/location fields are empty.

Usage:
    cd backend
    source .venv/Scripts/activate
    python ../scripts/fix_era_location.py
"""

import json
import os
import sqlite3
import sys

# Windows encoding fix
sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "data", "app.db")
DETAIL_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "artifacts_detail")

# Infobox keys that map to era
ERA_INFOBOX_KEYS = ["时代", "年代", "时期", "时期或古文明"]

# Infobox keys that map to location (in priority order)
LOCATION_INFOBOX_KEYS = ["出土", "发掘地点", "发掘于", "位置"]


def extract_from_infobox(infobox: dict, keys: list[str]) -> str:
    """Try to extract a value from infobox using a list of possible keys."""
    if not isinstance(infobox, dict):
        return ""
    for key in keys:
        val = infobox.get(key, "")
        if val and isinstance(val, str) and val.strip():
            return val.strip()
    return ""


def main():
    db_path = os.path.abspath(DB_PATH)
    detail_dir = os.path.abspath(DETAIL_DIR)

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        sys.exit(1)
    if not os.path.exists(detail_dir):
        print(f"Detail directory not found at {detail_dir}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    cursor = conn.cursor()

    # Load all artifacts from DB into a name -> (id, era, location) map
    cursor.execute("SELECT id, name, era, location FROM artifacts")
    db_artifacts = {}
    for aid, name, era, loc in cursor.fetchall():
        db_artifacts[name] = (aid, era, loc)

    print(f"Database has {len(db_artifacts)} artifacts")

    # Process detail files
    detail_files = [f for f in os.listdir(detail_dir) if f.endswith(".json")]
    print(f"Found {len(detail_files)} detail files")

    updated_era = 0
    updated_location = 0
    updated_both = 0
    not_in_db = 0

    for filename in detail_files:
        filepath = os.path.join(detail_dir, filename)
        with open(filepath, encoding="utf-8") as f:
            detail = json.load(f)

        name = detail.get("name", "")
        if name not in db_artifacts:
            not_in_db += 1
            continue

        artifact_id, current_era, current_loc = db_artifacts[name]

        # Get era: prefer top-level field, fall back to infobox
        era = detail.get("era", "").strip()
        if not era:
            era = extract_from_infobox(detail.get("infobox", {}), ERA_INFOBOX_KEYS)

        # Get location: prefer top-level field, fall back to infobox
        location = detail.get("location", "").strip()
        if not location:
            location = extract_from_infobox(detail.get("infobox", {}), LOCATION_INFOBOX_KEYS)

        # Only update fields that are currently empty/null
        updates = {}
        if era and not current_era:
            updates["era"] = era
        if location and not current_loc:
            updates["location"] = location

        if updates:
            set_clauses = ", ".join(f"{k} = ?" for k in updates)
            values = list(updates.values()) + [artifact_id]
            cursor.execute(f"UPDATE artifacts SET {set_clauses} WHERE id = ?", values)

            if "era" in updates and "location" in updates:
                updated_both += 1
            elif "era" in updates:
                updated_era += 1
            else:
                updated_location += 1

    conn.commit()

    # Final stats
    cursor.execute("SELECT COUNT(*) FROM artifacts WHERE era IS NOT NULL AND era != ''")
    total_era = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM artifacts WHERE location IS NOT NULL AND location != ''")
    total_loc = cursor.fetchone()[0]

    conn.close()

    print(f"\nDone!")
    print(f"  Updated era only: {updated_era}")
    print(f"  Updated location only: {updated_location}")
    print(f"  Updated both: {updated_both}")
    print(f"  Not found in DB: {not_in_db}")
    print(f"  Total with era now: {total_era}/629")
    print(f"  Total with location now: {total_loc}/629")


if __name__ == "__main__":
    main()
