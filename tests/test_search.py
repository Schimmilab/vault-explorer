# tests/test_search.py
from indexer.vault import build_graph
from indexer.search import build_docs


def test_build_docs_has_content(mini_vault):
    g = build_graph(mini_vault)
    docs = build_docs(mini_vault, g)
    by_id = {d["id"]: d for d in docs}
    assert set(by_id) == {n.id for n in g.nodes}
    a = by_id["01-context/a.md"]
    assert a["title"] == "Notiz A"
    assert a["area"] == "01-context"
    assert "toter Link" in a["text"]  # Frontmatter entfernt, Body drin
