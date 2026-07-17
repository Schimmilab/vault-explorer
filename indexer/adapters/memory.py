"""Segment 'memory': Einzeldateien mit name/description-Frontmatter."""
from pathlib import Path

import frontmatter


def collect(memory_dir: Path) -> list[dict]:
    out: list[dict] = []
    if not memory_dir.exists():
        return out
    for md in sorted(memory_dir.glob("*.md")):
        if md.name == "MEMORY.md":
            continue  # der Index selbst ist kein Eintrag
        try:
            meta = frontmatter.loads(md.read_text(encoding="utf-8")).metadata
        except Exception:
            meta = {}
        out.append({
            "id": f"memory:{md.stem}",
            "label": str(meta.get("name", md.stem)),
            "segment": "memory",
            "meta": {"beschreibung": str(meta.get("description", "")), "pfad": str(md)},
        })
    return out
