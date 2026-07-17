"""Segment 'commands': *.md in ~/.claude/commands/ (und optional weiteren Wurzeln)."""
from pathlib import Path

import frontmatter


def _describe(md: Path) -> str:
    """Kurzbeschreibung: description-Frontmatter → erste Blockquote-Zeile (> …,
    so schreiben die ki-os-Commands ihre Kurzbeschreibung) → erste Prosa-Zeile."""
    try:
        post = frontmatter.loads(md.read_text(encoding="utf-8"))
        if post.metadata.get("description"):
            return str(post.metadata["description"])
        lines = post.content.splitlines()
    except Exception:
        try:
            lines = md.read_text(encoding="utf-8", errors="replace").splitlines()
        except Exception:
            return ""
    for line in lines:
        s = line.strip()
        if s.startswith(">"):
            return s.lstrip(">").strip()
    for line in lines:
        s = line.strip()
        if s and not s.startswith("#"):
            return s
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
            "meta": {"beschreibung": _describe(md), "pfad": str(md)},
        })


def collect(claude_home: Path, extra_roots: list[Path] | None = None) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    _scan(claude_home / "commands", out, seen)
    for root in (extra_roots or []):
        _scan(root, out, seen)
    return out
