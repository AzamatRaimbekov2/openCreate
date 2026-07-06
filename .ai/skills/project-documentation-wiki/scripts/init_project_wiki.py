#!/usr/bin/env python3
"""Ensure a lightweight LLM Wiki documentation structure for a project."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from pathlib import Path


PAGE_TAGS = {
    "overview": "wiki/overview",
    "schema": "wiki/schema",
    "index": "wiki/index",
    "log": "wiki/log",
    "source": "wiki/source",
    "concept": "wiki/concept",
    "entity": "wiki/entity",
    "architecture": "wiki/architecture",
    "workflow": "wiki/workflow",
    "decision": "wiki/decision",
    "synthesis": "wiki/synthesis",
    "feature": "feature-doc",
}

OBSIDIAN_GROUPS = [
    ("Architecture", "tag:#wiki/architecture", "#3B82F6", 0x3B82F6),
    ("Workflows", "tag:#wiki/workflow", "#22C55E", 0x22C55E),
    ("Concepts", "tag:#wiki/concept", "#F59E0B", 0xF59E0B),
    ("Entities", "tag:#wiki/entity", "#A855F7", 0xA855F7),
    ("Decisions", "tag:#wiki/decision", "#EF4444", 0xEF4444),
    ("Sources", "tag:#wiki/source", "#64748B", 0x64748B),
    ("Synthesis", "tag:#wiki/synthesis", "#14B8A6", 0x14B8A6),
    ("Feature docs", "tag:#feature-doc", "#F97316", 0xF97316),
]


def write_if_missing(path: Path, content: str) -> bool:
    if path.exists():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return True


def append_once(path: Path, marker: str, content: str) -> bool:
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    if marker in existing:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        if existing and not existing.endswith("\n"):
            handle.write("\n")
        handle.write(content)
    return True


def frontmatter(page_type: str, status: str = "draft") -> str:
    today = dt.date.today().isoformat()
    tag = PAGE_TAGS.get(page_type, f"wiki/{page_type}")
    return (
        "---\n"
        f"type: {page_type}\n"
        f"status: {status}\n"
        f"updated: {today}\n"
        "sources: []\n"
        "tags:\n"
        "  - project-docs\n"
        f"  - {tag}\n"
        "---\n\n"
    )


def title_from_path(path: Path) -> str:
    name = path.stem if path.suffix else path.name
    words = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", name)
    words = words.replace("-", " ").replace("_", " ")
    return " ".join(part.capitalize() for part in words.split()) or "Feature"


def ensure_feature_doc(root: Path, feature_path: str) -> tuple[Path, bool]:
    target = (root / feature_path).resolve()
    feature_dir = target if target.is_dir() else target.parent
    feature_name = title_from_path(feature_dir)
    doc_path = feature_dir / "FEATURE.md"
    rel_target = target.relative_to(root) if target.exists() else Path(feature_path)
    content = (
        frontmatter("feature")
        + f"# {feature_name}\n\n"
        + "## Purpose\n\n"
        + "TODO: Describe the user or business outcome this feature supports.\n\n"
        + "## Entry Points\n\n"
        + f"- `{rel_target.as_posix()}`\n\n"
        + "## Behavior\n\n"
        + "TODO: Describe main states, validation, permissions, data flow, API calls, and error handling.\n\n"
        + "## Dependencies\n\n"
        + "TODO: List important services, stores, hooks, components, schemas, and external systems.\n\n"
        + "## UX Notes\n\n"
        + "TODO: Document visible screens, interactions, loading states, empty states, and failure states.\n\n"
        + "## Tests and Verification\n\n"
        + "TODO: List focused tests and commands that verify this feature.\n\n"
        + "## Wiki Links\n\n"
        + "- [[overview]]\n\n"
        + "## Open Questions\n\n"
        + "- TODO: Capture unclear requirements or stale-risk notes.\n"
    )
    created = write_if_missing(doc_path, content)
    return doc_path, created


def ensure_obsidian_graph(root: Path, wiki: Path) -> tuple[Path, bool, bool]:
    note_path = wiki / "obsidian-graph-groups.md"
    note = (
        frontmatter("source", "current")
        + "# Obsidian Graph Groups\n\n"
        + "Use these graph color groups when Obsidian automatic configuration is unavailable.\n\n"
        + "| Group | Query | Color |\n"
        + "| --- | --- | --- |\n"
        + "".join(f"| {name} | `{query}` | `{hex_color}` |\n" for name, query, hex_color, _ in OBSIDIAN_GROUPS)
    )
    note_created = write_if_missing(note_path, note)

    obsidian_dir = root / ".obsidian"
    if not obsidian_dir.exists():
        return note_path, note_created, note_created

    graph_path = obsidian_dir / "graph.json"
    if graph_path.exists():
        try:
            data = json.loads(graph_path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                data = {}
        except json.JSONDecodeError:
            return note_path, note_created, note_created
    else:
        data = {}

    groups = data.get("colorGroups")
    if not isinstance(groups, list):
        groups = []

    existing_queries = {
        group.get("query")
        for group in groups
        if isinstance(group, dict) and isinstance(group.get("query"), str)
    }
    changed = False
    for name, query, _hex_color, rgb in OBSIDIAN_GROUPS:
        if query in existing_queries:
            continue
        groups.append({"query": query, "color": {"a": 1, "rgb": rgb}})
        changed = True

    if changed or "colorGroups" not in data:
        data["colorGroups"] = groups
        graph_path.parent.mkdir(parents=True, exist_ok=True)
        graph_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        return graph_path, True, note_created

    return graph_path, False, note_created


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create or update docs/wiki scaffolding for a persistent project documentation wiki."
    )
    parser.add_argument(
        "--project",
        default=".",
        help="Project root to initialize. Defaults to current directory.",
    )
    parser.add_argument(
        "--docs-dir",
        default="docs/wiki",
        help="Wiki directory relative to the project root. Defaults to docs/wiki.",
    )
    parser.add_argument(
        "--project-name",
        default=None,
        help="Human-readable project name. Defaults to the project directory name.",
    )
    parser.add_argument(
        "--feature-path",
        action="append",
        default=[],
        help="Feature file or folder that should have a local FEATURE.md. Can be repeated.",
    )
    parser.add_argument(
        "--obsidian",
        choices=("auto", "on", "off"),
        default="auto",
        help="Configure Obsidian graph color groups when possible. Defaults to auto.",
    )
    args = parser.parse_args()

    root = Path(args.project).resolve()
    wiki = root / args.docs_dir
    project_name = args.project_name or root.name
    today = dt.date.today().isoformat()

    dirs = [
        "raw/assets",
        "sources",
        "architecture",
        "workflows",
        "concepts",
        "entities",
        "decisions",
        "synthesis",
        "sources/jira",
        "sources/confluence",
    ]
    for rel in dirs:
        (wiki / rel).mkdir(parents=True, exist_ok=True)

    created = []
    updated = []

    files = {
        wiki / "schema.md": (
            frontmatter("schema", "current")
            + f"# {project_name} Wiki Schema\n\n"
            + "## Layers\n\n"
            + "- `raw/`: immutable imported sources and assets.\n"
            + "- Generated pages: LLM-maintained markdown summaries, concepts, entities, architecture notes, workflows, decisions, and synthesis.\n"
            + "- `index.md` and `log.md`: navigation and chronological audit trail.\n\n"
            + "## Page Rules\n\n"
            + "- Keep pages concise, cited, and cross-linked with `[[Wiki Links]]` where practical.\n"
            + "- Mark uncertain claims as hypotheses or `needs-review`.\n"
            + "- Update `index.md` and append `log.md` after every wiki change.\n"
            + "- Create or update local `FEATURE.md` files beside meaningful feature folders touched by a task.\n"
            + "\n## Startup and Update Rule\n\n"
            + "- At task start, read `index.md`, `schema.md`, recent `log.md`, and relevant local `FEATURE.md` files.\n"
            + "- If code, config, behavior, UI, APIs, data models, tests, or operations change, update affected wiki pages and local feature docs before finishing.\n"
            + "- Use `sources/jira/` and `sources/confluence/` for live MCP-backed summaries when those connectors are available.\n"
        ),
        wiki / "overview.md": (
            frontmatter("overview")
            + f"# {project_name} Overview\n\n"
            + "## Purpose\n\n"
            + "TODO: Summarize what this project does and who it serves.\n\n"
            + "## Main Systems\n\n"
            + "TODO: Link the most important architecture, workflow, concept, and entity pages.\n"
        ),
        wiki / "index.md": (
            frontmatter("index", "current")
            + f"# {project_name} Wiki Index\n\n"
            + "## Start Here\n\n"
            + f"- [[overview]] - High-level project overview.\n"
            + f"- [[schema]] - Wiki conventions and maintenance rules.\n\n"
            + "## Architecture\n\n"
            + "## Workflows\n\n"
            + "## Concepts\n\n"
            + "## Entities\n\n"
            + "## Decisions\n\n"
            + "## Sources\n\n"
            + "## Synthesis\n"
            + "## Local Feature Docs\n"
        ),
        wiki / "log.md": (
            frontmatter("log", "current")
            + f"# {project_name} Wiki Log\n\n"
            + f"## [{today}] bootstrap | Wiki initialized\n\n"
            + f"- Created initial LLM Wiki structure in `{args.docs_dir}`.\n"
        ),
    }

    for path, content in files.items():
        if write_if_missing(path, content):
            created.append(path)

    schema_path = wiki / "schema.md"
    if schema_path.exists() and append_once(
        schema_path,
        "## Startup and Update Rule",
        (
            "\n## Startup and Update Rule\n\n"
            "- At task start, read `index.md`, `schema.md`, recent `log.md`, and relevant local `FEATURE.md` files.\n"
            "- If code, config, behavior, UI, APIs, data models, tests, or operations change, update affected wiki pages and local feature docs before finishing.\n"
            "- Use `sources/jira/` and `sources/confluence/` for live MCP-backed summaries when those connectors are available.\n"
        ),
    ):
        updated.append(schema_path)

    feature_docs = []
    for feature_path in args.feature_path:
        doc_path, was_created = ensure_feature_doc(root, feature_path)
        feature_docs.append(doc_path)
        if was_created:
            created.append(doc_path)

    obsidian_target = None
    if args.obsidian == "on" or (args.obsidian == "auto" and (root / ".obsidian").exists()):
        obsidian_target, obsidian_changed, note_created = ensure_obsidian_graph(root, wiki)
        if note_created:
            created.append(wiki / "obsidian-graph-groups.md")
        if obsidian_changed and obsidian_target.exists() and obsidian_target not in created:
            updated.append(obsidian_target)

    print(f"Wiki checked at {wiki}")
    if created:
        print("Created files:")
        for path in created:
            print(f"- {path.relative_to(root)}")
    if updated:
        print("Updated files:")
        for path in updated:
            print(f"- {path.relative_to(root)}")
    if feature_docs:
        print("Feature docs:")
        for path in feature_docs:
            print(f"- {path.relative_to(root)}")
    if obsidian_target:
        print(f"Obsidian support: {obsidian_target.relative_to(root)}")
    if not created and not updated:
        print("No files were changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
