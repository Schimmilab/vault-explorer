"""FastAPI-Server: liefert Graph-, Such-, System- und Notiz-Daten read-only."""
from dataclasses import asdict

from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse

import config
from indexer.vault import build_graph
from indexer.search import build_docs

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


def _safe_path(note_id: str):
    root = config.VAULT_ROOT.resolve()
    target = (root / note_id).resolve()
    if not (target == root or str(target).startswith(str(root) + "/")):
        raise HTTPException(status_code=403, detail="outside vault")
    if not target.exists():
        raise HTTPException(status_code=404, detail="not found")
    return target


@app.get("/api/note/{note_id:path}", response_class=PlainTextResponse)
def note(note_id: str):
    return _safe_path(note_id).read_text(encoding="utf-8", errors="replace")


@app.get("/api/search-index")
def search_index():
    return build_docs(config.VAULT_ROOT, _graph())
