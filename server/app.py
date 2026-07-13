"""FastAPI-Server: liefert Graph-, Such-, System- und Notiz-Daten read-only."""
from dataclasses import asdict

from fastapi import FastAPI

import config
from indexer.vault import build_graph

app = FastAPI(title="Vault-Explorer")
_cache: dict = {}


def _graph():
    if "graph" not in _cache:
        _cache["graph"] = build_graph(config.VAULT_ROOT)
    return _cache["graph"]


@app.get("/api/health")
def health():
    found = config.VAULT_ROOT.exists()
    n = len(_graph().nodes) if found else 0
    return {"vaultRoot": str(config.VAULT_ROOT), "vaultFound": found, "nodeCount": n}


@app.get("/api/graph")
def graph():
    g = _graph()
    return {"nodes": [asdict(n) for n in g.nodes], "edges": [asdict(e) for e in g.edges]}
