"""Segment 'routines': *.md/*.yaml in einem optionalen Routinen-Verzeichnis.
Quelle ist optional — fehlt sie (None), bleibt das Segment leer."""
from pathlib import Path


def collect(routines_dir: Path | None) -> list[dict]:
    if not routines_dir or not Path(routines_dir).exists():
        return []
    out: list[dict] = []
    for f in sorted(Path(routines_dir).glob("*")):
        if f.suffix in {".md", ".yaml", ".yml"}:
            out.append({
                "id": f"routine:{f.stem}",
                "label": f.stem,
                "segment": "routines",
                "meta": {"pfad": str(f)},
            })
    return out
