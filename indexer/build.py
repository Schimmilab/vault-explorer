"""CLI: baut alle JSON-Artefakte in DATA_DIR. Aufruf: python -m indexer.build"""
import json
from dataclasses import asdict
from pathlib import Path

import config
from .vault import build_graph
from .search import build_docs
from .insights import orphans, hubs, dead_links
from .system import build_system


def build_all(vault_root: Path, out_dir: Path) -> dict:
    graph = build_graph(vault_root)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "graph.json").write_text(
        json.dumps(
            {"nodes": [asdict(n) for n in graph.nodes], "edges": [asdict(e) for e in graph.edges]},
            ensure_ascii=False, indent=2, default=str,  # frontmatter kann date/datetime enthalten
        ),
        encoding="utf-8",
    )
    (out_dir / "search-docs.json").write_text(
        json.dumps(build_docs(vault_root, graph), ensure_ascii=False), encoding="utf-8"
    )
    (out_dir / "insights.json").write_text(
        json.dumps(
            {"orphans": orphans(graph), "hubs": hubs(graph), "deadLinks": dead_links(graph)},
            ensure_ascii=False, indent=2,
        ),
        encoding="utf-8",
    )
    system = build_system(vault_root=vault_root)
    (out_dir / "system.json").write_text(
        json.dumps(system, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"nodes": len(graph.nodes), "edges": len(graph.edges), "system": system["counts"]}


if __name__ == "__main__":
    stats = build_all(config.VAULT_ROOT, config.DATA_DIR)
    print(f"Indexed {stats['nodes']} nodes, {stats['edges']} edges → {config.DATA_DIR}")
    print(f"System-Ring: {stats['system']}")
