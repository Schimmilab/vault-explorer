# tests/test_api.py
import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(mini_vault, monkeypatch):
    monkeypatch.setenv("VAULTX_VAULT", str(mini_vault))
    import config
    importlib.reload(config)
    from server import app as appmod
    importlib.reload(appmod)
    return TestClient(appmod.app)


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["vaultFound"] is True
    assert body["nodeCount"] == 4


def test_graph(client):
    r = client.get("/api/graph")
    assert r.status_code == 200
    body = r.json()
    assert len(body["nodes"]) == 4
    assert any(e["broken"] for e in body["edges"])


def test_note_returns_markdown(client):
    r = client.get("/api/note/01-context/b.md")
    assert r.status_code == 200
    assert "Notiz B" in r.text


def test_note_404_for_missing(client):
    assert client.get("/api/note/nope.md").status_code == 404


def test_note_blocks_path_traversal(client):
    # Direkt die Schutzfunktion prüfen — httpx normalisiert ../ in der URL weg,
    # ein HTTP-Test würde die Route verfehlen (404) statt den Schutz zu prüfen.
    import server.app as appmod
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        appmod._safe_path("../../../etc/passwd")
    assert exc.value.status_code == 403


def test_search_index(client):
    r = client.get("/api/search-index")
    assert r.status_code == 200
    ids = {d["id"] for d in r.json()}
    assert "01-context/a.md" in ids


def test_open_invokes_opener(client, monkeypatch):
    calls = []
    import server.app as appmod
    monkeypatch.setattr(appmod.subprocess, "Popen", lambda args, **k: calls.append(args))
    r = client.post("/api/open", json={"id": "01-context/a.md"})
    assert r.status_code == 200
    assert len(calls) == 1
    assert calls[0][-1].endswith("01-context/a.md")


def test_open_404_missing(client):
    assert client.post("/api/open", json={"id": "nope.md"}).status_code == 404


def test_system_endpoint(client):
    r = client.get("/api/system")
    assert r.status_code == 200
    body = r.json()
    assert "segments" in body
    assert "counts" in body
    assert set(body["segments"]) == {"skills", "commands", "memory", "mcps", "routines"}
