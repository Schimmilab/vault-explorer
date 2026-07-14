"""Baut die Suchdokumente, die das Frontend in MiniSearch lädt."""
from pathlib import Path

import frontmatter

from .vault import Graph

# Großzügiger Deckel: deckt praktisch jede Notiz voll ab (auch Hub-Dateien wie
# open-loops.md mit ~120k Zeichen). Nur pathologisch große Dateien (OCR-Scans)
# werden getrimmt, damit ein einzelnes Riesen-File das Index-Payload nicht sprengt.
# Gesamt-Payload am echten Vault damit ~4 MB (vorher 6000er-Cap → 2,2 MB, 27% gekappt).
_MAX_CHARS = 200_000


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
