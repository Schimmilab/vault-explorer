"""Liest alle .md eines Vaults read-only und baut einen gerichteten Link-Graph."""
from dataclasses import dataclass, field
from pathlib import Path

import frontmatter

from .links import parse_links, resolve_target


@dataclass
class Node:
    id: str            # vault-relativer POSIX-Pfad
    label: str         # H1 oder Dateiname
    area: str          # Top-Ordner, "(root)" für Dateien direkt im Root
    kind: str = "note"
    in_degree: int = 0
    out_degree: int = 0
    size: int = 0
    frontmatter: dict = field(default_factory=dict)


@dataclass
class Edge:
    source: str
    target: str
    kind: str = "link"
    broken: bool = False


@dataclass
class Graph:
    nodes: list[Node]
    edges: list[Edge]


def _title(content: str, fallback: str) -> str:
    for line in content.splitlines():
        s = line.strip()
        if s.startswith("# "):
            return s[2:].strip()
    return fallback


def _area(relpath: str) -> str:
    parts = relpath.split("/")
    return parts[0] if len(parts) > 1 else "(root)"


def _included(path: Path, root: Path) -> bool:
    parts = path.relative_to(root).parts
    if any(p.startswith(".") for p in parts):  # .git, .claude …
        return False
    return "_papierkorb" not in parts


def build_graph(vault_root: Path) -> Graph:
    files = sorted(p for p in vault_root.rglob("*.md") if _included(p, vault_root))
    nodes: dict[str, Node] = {}
    pending: list[tuple[str, str]] = []  # (source_id, resolved_target)

    for p in files:
        rel = p.relative_to(vault_root).as_posix()
        try:
            post = frontmatter.loads(p.read_text(encoding="utf-8"))
            content, fm = post.content, dict(post.metadata)
        except Exception:
            content, fm = p.read_text(encoding="utf-8", errors="replace"), {}
        nodes[rel] = Node(id=rel, label=_title(content, p.stem), area=_area(rel), frontmatter=fm)
        for raw_target, is_image in parse_links(content):
            if is_image:
                continue  # Bilder sind Anhänge, keine Notiz-Kanten im MVP
            resolved = resolve_target(rel, raw_target)
            if resolved:
                pending.append((rel, resolved))

    edges: list[Edge] = []
    for source, target in pending:
        broken = target not in nodes
        edges.append(Edge(source=source, target=target, broken=broken))
        nodes[source].out_degree += 1
        if not broken:
            nodes[target].in_degree += 1

    for n in nodes.values():
        n.size = n.in_degree  # Startheuristik; Bereichs-Aggregat macht das Frontend

    return Graph(nodes=list(nodes.values()), edges=edges)
