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
