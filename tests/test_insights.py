# tests/test_insights.py
from indexer.vault import build_graph
from indexer.insights import orphans, hubs, dead_links


def test_orphans(mini_vault):
    g = build_graph(mini_vault)
    o = orphans(g)
    assert "04-projects/orphan.md" in o
    assert "CLAUDE.md" in o        # niemand verlinkt CLAUDE.md
    assert "01-context/b.md" not in o


def test_hubs(mini_vault):
    g = build_graph(mini_vault)
    h = hubs(g, top=1)
    assert h == ["01-context/b.md"]  # höchster in_degree (2)


def test_dead_links(mini_vault):
    g = build_graph(mini_vault)
    d = dead_links(g)
    assert d == [{"source": "01-context/a.md", "target": "01-context/fehlt.md"}]
