"""Segment 'commands': *.md in ~/.claude/commands/ (und optional weiteren Wurzeln)."""
from pathlib import Path


def _first_line(md: Path) -> str:
    try:
        for line in md.read_text(encoding="utf-8", errors="replace").splitlines():
            s = line.strip().lstrip("#").strip()
            if s.startswith(">"):
                s = s[1:].strip()
            if s:
                return s
    except Exception:
        pass
    return ""


def _scan(cmd_dir: Path, out: list[dict], seen: set[str]) -> None:
    if not cmd_dir.exists():
        return
    for md in sorted(cmd_dir.glob("*.md")):
        if md.stem in seen:
            continue
        seen.add(md.stem)
        out.append({
            "id": f"command:{md.stem}",
            "label": md.stem,
            "segment": "commands",
            "meta": {"beschreibung": _first_line(md), "pfad": str(md)},
        })


def collect(claude_home: Path, extra_roots: list[Path] | None = None) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    _scan(claude_home / "commands", out, seen)
    for root in (extra_roots or []):
        _scan(root, out, seen)
    return out
