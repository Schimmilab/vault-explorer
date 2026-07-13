"""Parst Standard-Markdown-Links `[text](pfad)` und löst relative Pfade auf.
Doppelt-eckige Wikilinks werden bewusst NICHT unterstützt (Vault-Konvention)."""
import re
from pathlib import PurePosixPath

_LINK_RE = re.compile(r"(!?)\[[^\]]*\]\(([^)]+)\)")


def parse_links(markdown: str) -> list[tuple[str, bool]]:
    """Liefert (raw_target, is_image) je Link in Reihenfolge des Auftretens."""
    out: list[tuple[str, bool]] = []
    for m in _LINK_RE.finditer(markdown):
        is_image = m.group(1) == "!"
        target = m.group(2).strip()
        if " " in target:  # [text](pfad "Titel")
            target = target.split(" ", 1)[0]
        out.append((target, is_image))
    return out


def resolve_target(source_relpath: str, raw_target: str) -> str | None:
    """Auf vault-relativen POSIX-Pfad auflösen, oder None wenn extern/nur-Anker."""
    t = raw_target.strip()
    if t.startswith(("http://", "https://", "mailto:", "#")):
        return None
    t = t.split("#", 1)[0].split("?", 1)[0]
    if not t:
        return None
    combined = PurePosixPath(source_relpath).parent / t
    parts: list[str] = []
    for part in combined.parts:
        if part == "..":
            if parts:
                parts.pop()
        elif part == ".":
            continue
        else:
            parts.append(part)
    return "/".join(parts) if parts else None
