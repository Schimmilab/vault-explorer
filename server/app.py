"""FastAPI-Server: liefert Graph-, Such-, System- und Notiz-Daten read-only."""
import subprocess
import sys
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

import config
from indexer.vault import build_graph
from indexer.search import build_docs
from indexer.system import build_system
from indexer.insights import orphans, hubs, dead_links

app = FastAPI(title="Vault-Explorer")
_cache: dict = {}


def _graph():
    if "graph" not in _cache:
        _cache["graph"] = build_graph(config.VAULT_ROOT)
    return _cache["graph"]


def _system():
    if "system" not in _cache:
        _cache["system"] = build_system()
    return _cache["system"]


def _known_system_paths() -> set[str]:
    """Whitelist: nur Dateien, die der Ring tatsächlich kennt, dürfen gelesen/
    geöffnet werden — kein beliebiger Dateizugriff über die System-Endpoints."""
    paths: set[str] = set()
    for items in _system()["segments"].values():
        for it in items:
            p = it.get("meta", {}).get("pfad")
            if p:
                paths.add(p)
    return paths


@app.get("/api/health")
def health():
    found = config.VAULT_ROOT.exists()
    n = len(_graph().nodes) if found else 0
    return {"vaultRoot": str(config.VAULT_ROOT), "vaultFound": found, "nodeCount": n}


@app.get("/api/graph")
def graph():
    g = _graph()
    return {"nodes": [asdict(n) for n in g.nodes], "edges": [asdict(e) for e in g.edges]}


@app.post("/api/reload")
def reload():
    """Cache leeren → Vault + System werden neu von der Platte eingelesen
    (neue/gelöschte Notizen übernehmen, ohne den Server neu zu starten)."""
    _cache.clear()
    g = _graph()  # gleich neu aufbauen, damit die Antwort die neue Zahl nennt
    return {"reloaded": True, "nodeCount": len(g.nodes)}


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


@app.get("/api/insights")
def insights():
    """Wartungs-Analysen über den Graph: Orphans, Hubs, tote Links."""
    g = _graph()
    return {"orphans": orphans(g), "hubs": hubs(g), "dead_links": dead_links(g)}


@app.get("/api/search-index")
def search_index():
    return build_docs(config.VAULT_ROOT, _graph())


@app.get("/api/system")
def system():
    return _system()


@app.get("/api/system-file", response_class=PlainTextResponse)
def system_file(path: str):
    """Read-only Vorschau einer System-Ring-Datei (Skill/Command/Memory).
    Nur Pfade aus der Ring-Whitelist; sonst 403."""
    if path not in _known_system_paths():
        raise HTTPException(status_code=403, detail="unknown system path")
    p = Path(path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="not found")
    return p.read_text(encoding="utf-8", errors="replace")


class OpenPathReq(BaseModel):
    path: str


@app.post("/api/open-system")
def open_system(req: OpenPathReq):
    if req.path not in _known_system_paths():
        raise HTTPException(status_code=403, detail="unknown system path")
    opener = "open" if sys.platform == "darwin" else "xdg-open"
    subprocess.Popen([opener, req.path])
    return {"opened": req.path}


class OpenReq(BaseModel):
    id: str


@app.post("/api/open")
def open_file(req: OpenReq):
    target = _safe_path(req.id)  # 403/404 wie bei /api/note
    opener = "open" if sys.platform == "darwin" else "xdg-open"
    subprocess.Popen([opener, str(target)])
    return {"opened": req.id}
