"""Baut die Suchdokumente, die das Frontend in MiniSearch lädt."""
from pathlib import Path

import frontmatter

from .vault import Graph

_MAX_CHARS = 6000


def build_docs(vault_root: Path, graph: Graph) -> list[dict]:
    docs: list[dict] = []
    for n in graph.nodes:
        try:
            text = frontmatter.load(vault_root / n.id).content
        except Exception:
            text = ""
        docs.append({
            "id": n.id,
            "title": n.label,
            "area": n.area,
            "text": text[:_MAX_CHARS],
        })
    return docs
