"""Rule-based triple generation and Neo4j import script.

Generates triples from structured artifact fields and imports them into Neo4j.
Can also export to JSON if Neo4j is unavailable.

Triple patterns:
  - artifact 属于朝代 era
  - artifact 属于类别 category
  - artifact 出土于 location
  - artifact 材质为 material
  - artifact 馈藏于 museum
  - artifact 包含标签 tag (comma-split tags)

Usage:
    # Export to JSON (Neo4j unavailable)
    python -m backend.scripts.import_to_neo4j --output graph_data.json

    # Import to Neo4j
    python -m backend.scripts.import_to_neo4j --neo4j-uri bolt://localhost:7687 \
        --neo4j-user neo4j --neo4j-password your_password

    # Use custom database
    python -m backend.scripts.import_to_neo4j --db sqlite:///path/to/app.db --output graph_data.json
"""

import argparse
import json
import logging
import os
import sys
from collections import defaultdict
from typing import Optional

# Bootstrap: make sure backend is importable
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_repo_root = os.path.abspath(os.path.join(_backend_dir, ".."))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s — %(message)s",
)
logger = logging.getLogger("import_to_neo4j")


# ── Triple Generation ─────────────────────────────────────────────────────


def generate_triples(artifacts: list) -> tuple[list[dict], list[dict]]:
    """Generate nodes and relations from artifact structured fields.

    Returns:
        (nodes, relations) where:
        - nodes: list of {id, name, type, properties}
        - relations: list of {source, target, relation, properties}
    """
    nodes_map: dict[str, dict] = {}  # id -> node dict
    relations: list[dict] = []

    # Track unique entities by type
    entity_counter: dict[str, int] = defaultdict(int)

    def make_entity_id(entity_type: str, entity_name: str) -> str:
        """Create a unique entity ID from type and name."""
        # Use type:name format for consistency with graph service
        sanitized = entity_name.strip().replace("/", "_").replace("\\", "_")
        return f"{entity_type}:{sanitized}"

    def add_entity_node(entity_type: str, entity_name: str) -> str:
        """Add an entity node if not exists, return its ID."""
        if not entity_name or not entity_name.strip():
            return None

        entity_name = entity_name.strip()
        entity_id = make_entity_id(entity_type, entity_name)

        if entity_id not in nodes_map:
            nodes_map[entity_id] = {
                "id": entity_id,
                "name": entity_name,
                "type": entity_type,
                "properties": {"count": 1},
            }
            entity_counter[entity_type] += 1
        else:
            # Increment count for existing entity
            nodes_map[entity_id]["properties"]["count"] += 1

        return entity_id

    def add_artifact_node(artifact) -> str:
        """Add an artifact node, return its ID."""
        artifact_id = f"artifact:{artifact.id}"

        properties = {
            "artifact_id": artifact.id,
            "name": artifact.name,
        }
        if artifact.description:
            properties["description"] = artifact.description[:500]  # truncate
        if artifact.image_url:
            properties["image_url"] = artifact.image_url
        if artifact.dimensions:
            properties["dimensions"] = artifact.dimensions

        nodes_map[artifact_id] = {
            "id": artifact_id,
            "name": artifact.name,
            "type": "artifact",
            "properties": properties,
        }
        entity_counter["artifact"] += 1

        return artifact_id

    def add_relation(source_id: str, target_id: str, relation: str) -> None:
        """Add a relation between two nodes."""
        if not source_id or not target_id:
            return

        relations.append({
            "source": source_id,
            "target": target_id,
            "relation": relation,
            "properties": {},
        })

    # Process each artifact
    for artifact in artifacts:
        artifact_id = add_artifact_node(artifact)

        # Era relation: artifact 属于朝代 era
        if artifact.era:
            era_id = add_entity_node("era", artifact.era)
            if era_id:
                add_relation(artifact_id, era_id, "属于朝代")

        # Category relation: artifact 属于类别 category
        if artifact.category:
            category_id = add_entity_node("category", artifact.category)
            if category_id:
                add_relation(artifact_id, category_id, "属于类别")

        # Location relation: artifact 出土于 location
        if artifact.location:
            location_id = add_entity_node("location", artifact.location)
            if location_id:
                add_relation(artifact_id, location_id, "出土于")

        # Material relation: artifact 材质为 material
        if artifact.material:
            material_id = add_entity_node("material", artifact.material)
            if material_id:
                add_relation(artifact_id, material_id, "材质为")

        # Museum relation: artifact 馈藏于 museum
        if artifact.museum:
            museum_id = add_entity_node("museum", artifact.museum)
            if museum_id:
                add_relation(artifact_id, museum_id, "馈藏于")

        # Tags relations: artifact 包含标签 tag (comma-split)
        if artifact.tags:
            for tag in artifact.tags.split(","):
                tag = tag.strip()
                if tag:
                    tag_id = add_entity_node("tag", tag)
                    if tag_id:
                        add_relation(artifact_id, tag_id, "包含标签")

        # Related artifacts: artifact 与 artifact 相关 (pipe-split)
        if artifact.related_artifacts:
            for related_name in artifact.related_artifacts.split("|"):
                related_name = related_name.strip()
                if related_name:
                    # Create a reference to another artifact by name
                    # We'll try to match it when importing
                    related_id = f"artifact_ref:{related_name}"
                    if related_id not in nodes_map:
                        nodes_map[related_id] = {
                            "id": related_id,
                            "name": related_name,
                            "type": "artifact_ref",
                            "properties": {"reference": True},
                        }
                    add_relation(artifact_id, related_id, "RELATED_TO")

    nodes = list(nodes_map.values())

    logger.info(
        "Generated %d nodes (%d artifacts, %d entities) and %d relations",
        len(nodes),
        entity_counter["artifact"],
        sum(entity_counter.values()) - entity_counter["artifact"],
        len(relations),
    )

    # Log entity type breakdown
    for entity_type, count in sorted(entity_counter.items()):
        if entity_type != "artifact":
            logger.info("  %s: %d unique entities", entity_type, count)

    return nodes, relations


# ── Neo4j Import ───────────────────────────────────────────────────────


def import_to_neo4j(
    nodes: list[dict],
    relations: list[dict],
    neo4j_uri: str,
    neo4j_user: str,
    neo4j_password: str,
) -> dict:
    """Import nodes and relations to Neo4j using MERGE.

    Returns summary stats.
    """
    try:
        from neo4j import GraphDatabase
    except ImportError:
        logger.error("neo4j package not installed. Install with: pip install neo4j")
        return {"success": False, "error": "neo4j package not installed"}

    driver = None
    try:
        driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))

        # Test connection
        with driver.session() as session:
            session.run("RETURN 1").single()
        logger.info("Connected to Neo4j at %s", neo4j_uri)

        # Clear existing data (optional - can be skipped)
        with driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")
        logger.info("Cleared existing Neo4j data")

        # Import nodes
        node_stats = defaultdict(int)
        with driver.session() as session:
            for node in nodes:
                node_type = node["type"]
                node_id = node["id"]
                node_name = node["name"]
                properties = node.get("properties", {})

                # Create node with MERGE to avoid duplicates
                cypher = f"""
                MERGE (n:{node_type} {{id: $id}})
                SET n.name = $name
                SET n += $properties
                """
                session.run(cypher, {
                    "id": node_id,
                    "name": node_name,
                    "properties": properties,
                })
                node_stats[node_type] += 1

        logger.info("Imported %d nodes to Neo4j", len(nodes))

        # Import relations
        relation_stats = defaultdict(int)
        with driver.session() as session:
            for rel in relations:
                source_id = rel["source"]
                target_id = rel["target"]
                relation = rel["relation"]

                # Parse source/target types from IDs (e.g., "artifact:xxx")
                source_type = source_id.split(":")[0]
                target_type = target_id.split(":")[0]

                cypher = f"""
                MATCH (s:{source_type} {{id: $source_id}})
                MATCH (t:{target_type} {{id: $target_id}})
                MERGE (s)-[r:{relation}]->(t)
                """
                session.run(cypher, {
                    "source_id": source_id,
                    "target_id": target_id,
                })
                relation_stats[relation] += 1

        logger.info("Imported %d relations to Neo4j", len(relations))

        return {
            "success": True,
            "nodes_imported": len(nodes),
            "relations_imported": len(relations),
            "node_types": dict(node_stats),
            "relation_types": dict(relation_stats),
        }

    except Exception as e:
        logger.exception("Neo4j import failed")
        return {"success": False, "error": str(e)}
    finally:
        if driver:
            driver.close()


def export_to_json(
    nodes: list[dict],
    relations: list[dict],
    output_path: str,
) -> dict:
    """Export nodes and relations to JSON file.

    Returns summary stats.
    """
    data = {
        "nodes": nodes,
        "links": relations,
        "metadata": {
            "total_nodes": len(nodes),
            "total_links": len(relations),
            "node_types": defaultdict(int),
            "relation_types": defaultdict(int),
        },
    }

    # Count types
    for node in nodes:
        data["metadata"]["node_types"][node["type"]] += 1
    for rel in relations:
        data["metadata"]["relation_types"][rel["relation"]] += 1

    # Convert defaultdicts to dicts for JSON serialization
    data["metadata"]["node_types"] = dict(data["metadata"]["node_types"])
    data["metadata"]["relation_types"] = dict(data["metadata"]["relation_types"])

    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info("Exported graph data to %s", output_path)

        return {
            "success": True,
            "output_path": output_path,
            "nodes_exported": len(nodes),
            "relations_exported": len(relations),
        }
    except Exception as e:
        logger.exception("JSON export failed")
        return {"success": False, "error": str(e)}


# ── Main ───────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate triples from artifacts and import to Neo4j or export JSON"
    )
    parser.add_argument(
        "--db",
        type=str,
        default=None,
        help="SQLite database URL (default: backend/data/app.db)",
    )
    parser.add_argument(
        "--neo4j-uri",
        type=str,
        default="bolt://localhost:7687",
        help="Neo4j connection URI",
    )
    parser.add_argument(
        "--neo4j-user",
        type=str,
        default="neo4j",
        help="Neo4j username",
    )
    parser.add_argument(
        "--neo4j-password",
        type=str,
        default=None,
        help="Neo4j password (required for Neo4j import)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Export graph data to JSON file instead of Neo4j",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of artifacts to process (for testing)",
    )
    args = parser.parse_args()

    # Determine database URL
    if args.db:
        db_url = args.db
    else:
        # Default to backend/data/app.db
        db_path = os.path.join(_backend_dir, "data", "app.db")
        db_url = f"sqlite:///{db_path}"

    logger.info("Using database: %s", db_url)

    # Load artifacts from SQLite
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.models.artifact import Artifact

    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    Session = sessionmaker(bind=engine)

    with Session() as session:
        query = session.query(Artifact).order_by(Artifact.id)
        if args.limit:
            query = query.limit(args.limit)
        artifacts = query.all()

    logger.info("Loaded %d artifacts from database", len(artifacts))

    if not artifacts:
        logger.warning("No artifacts found — nothing to process.")
        return

    # Generate triples
    nodes, relations = generate_triples(artifacts)

    # Export or import
    if args.output:
        # Export to JSON
        result = export_to_json(nodes, relations, args.output)
    elif args.neo4j_password:
        # Import to Neo4j
        result = import_to_neo4j(
            nodes, relations,
            args.neo4j_uri, args.neo4j_user, args.neo4j_password,
        )
    else:
        # No Neo4j password and no output file — export to default path
        default_output = os.path.join(_repo_root, "data", "graph_data.json")
        logger.info("No Neo4j password provided — exporting to default path: %s", default_output)
        result = export_to_json(nodes, relations, default_output)

    # Print summary
    print("\n" + "=" * 50)
    print("Summary")
    print("=" * 50)
    if result.get("success"):
        print(f"  Nodes: {result.get('nodes_imported') or result.get('nodes_exported')}")
        print(f"  Relations: {result.get('relations_imported') or result.get('relations_exported')}")
        if result.get("node_types"):
            print("\n  Node types:")
            for t, c in sorted(result["node_types"].items()):
                print(f"    {t}: {c}")
        if result.get("relation_types"):
            print("\n  Relation types:")
            for r, c in sorted(result["relation_types"].items()):
                print(f"    {r}: {c}")
        if result.get("output_path"):
            print(f"\n  Output file: {result['output_path']}")
    else:
        print(f"  Error: {result.get('error')}")
    print("=" * 50)


if __name__ == "__main__":
    main()