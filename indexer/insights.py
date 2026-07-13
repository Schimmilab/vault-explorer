"""Analysen über den Graph, die der native Obsidian-Graph nicht bietet."""
from .vault import Graph


def orphans(graph: Graph) -> list[str]:
    """Notizen, auf die nichts verlinkt."""
    return sorted(n.id for n in graph.nodes if n.in_degree == 0)


def hubs(graph: Graph, top: int = 10) -> list[str]:
    """Meistverlinkte Notizen (in_degree absteigend), nur mit mind. 1 Link."""
    ranked = sorted(graph.nodes, key=lambda n: n.in_degree, reverse=True)
    return [n.id for n in ranked[:top] if n.in_degree > 0]


def dead_links(graph: Graph) -> list[dict]:
    """Kanten, deren Ziel nicht existiert."""
    return [{"source": e.source, "target": e.target} for e in graph.edges if e.broken]
