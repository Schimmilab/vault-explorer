# tests/test_vault.py
from indexer.vault import build_graph


def test_build_graph_nodes(mini_vault):
    g = build_graph(mini_vault)
    ids = {n.id for n in g.nodes}
    # CLAUDE.md + a + b + orphan; NICHT _papierkorb, NICHT .claude
    assert ids == {"CLAUDE.md", "01-context/a.md", "01-context/b.md", "04-projects/orphan.md"}


def test_title_and_area(mini_vault):
    g = build_graph(mini_vault)
    a = next(n for n in g.nodes if n.id == "01-context/a.md")
    assert a.label == "Notiz A"
    assert a.area == "01-context"
    root = next(n for n in g.nodes if n.id == "CLAUDE.md")
    assert root.area == "(root)"


def test_frontmatter_parsed(mini_vault):
    g = build_graph(mini_vault)
    a = next(n for n in g.nodes if n.id == "01-context/a.md")
    assert a.frontmatter.get("type") == "note"
    assert a.frontmatter.get("tags") == ["test"]


def test_edges_and_degrees(mini_vault):
    g = build_graph(mini_vault)
    # a → b (gültig), a → fehlt.md (tot); CLAUDE → a, CLAUDE → b
    b = next(n for n in g.nodes if n.id == "01-context/b.md")
    assert b.in_degree == 2  # von a und CLAUDE
    dead = [e for e in g.edges if e.broken]
    assert len(dead) == 1
    assert dead[0].target == "01-context/fehlt.md"


def test_image_links_not_edges_to_notes(mini_vault):
    g = build_graph(mini_vault)
    # ![Bild](../img.png) darf keine Kante auf eine .md erzeugen
    targets = {e.target for e in g.edges}
    assert "img.png" not in targets
