"""Segment 'skills': SKILL.md-Ordner unter ~/.claude/skills/ und optional
weiteren Wurzeln (Vault-.claude/skills, Plugin-Skills). Read-only."""
from pathlib import Path

import frontmatter


def _describe(skill_md: Path) -> str:
    try:
        post = frontmatter.load(skill_md)
        if "description" in post.metadata:
            return str(post.metadata["description"])
        for line in post.content.splitlines():
            s = line.strip()
            if s and not s.startswith("#"):
                return s
    except Exception:
        pass
    return ""


def _scan(skills_dir: Path, source: str, out: list[dict], seen: set[str]) -> None:
    if not skills_dir.exists():
        return
    for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
        name = skill_md.parent.name
        if name in seen:
            continue  # gleicher Skill-Name gewinnt in der ersten (globalen) Quelle
        seen.add(name)
        out.append({
            "id": f"skill:{name}",
            "label": name,
            "segment": "skills",
            "meta": {"beschreibung": _describe(skill_md), "pfad": str(skill_md), "quelle": source},
        })


def collect(claude_home: Path, extra_roots: list[tuple[Path, str]] | None = None) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    _scan(claude_home / "skills", "global", out, seen)
    for root, source in (extra_roots or []):
        _scan(root, source, out, seen)
    return out
