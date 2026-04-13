"""
Seed script: import artifact data from data/artifacts_list.json into SQLite.

Usage:
    cd backend
    python seed.py
"""

import json
import os
import sys

# Ensure the backend directory is on sys.path so app modules resolve
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import engine, SessionLocal, init_db  # noqa: E402
from app.models.artifact import Artifact  # noqa: E402


DATA_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    os.pardir,
    "data",
    "artifacts_list.json",
)


def seed_artifacts() -> int:
    """Read artifacts_list.json and insert into the artifacts table.

    Returns the number of records inserted.
    """
    # Create tables if they do not exist yet
    init_db()

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        raw_items = json.load(f)

    db = SessionLocal()
    try:
        # Check if data already exists
        existing_count = db.query(Artifact).count()
        if existing_count > 0:
            print(f"Artifacts table already has {existing_count} rows, skipping import.")
            return 0

        artifacts: list[Artifact] = []
        for item in raw_items:
            artifacts.append(
                Artifact(
                    name=item.get("name", ""),
                    category=item.get("category"),
                    image_url=item.get("url"),
                )
            )

        db.add_all(artifacts)
        db.commit()
        print(f"Successfully imported {len(artifacts)} artifacts.")
        return len(artifacts)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    count = seed_artifacts()
    print(f"Done. {count} records processed.")
