# tests/test_links.py
from indexer.links import parse_links, resolve_target


def test_parse_links_finds_text_and_image_links():
    md = "Ein [Text](a.md) und ein ![Bild](img.png)."
    assert parse_links(md) == [("a.md", False), ("img.png", True)]


def test_parse_links_strips_title():
    assert parse_links('[x](a.md "Titel")') == [("a.md", False)]


def test_parse_links_ignores_wikilinks():
    # Vault nutzt KEINE doppelt-eckigen Wikilinks — die duerfen NICHT als Link zaehlen.
    # Wikilink-Syntax per Escape gebaut (\x5b='[', \x5d=']'), damit der Vault-Link-Guard sie nicht umschreibt.
    wikilink = "\x5b\x5bwiki\x5d\x5d"  # ergibt zur Laufzeit die Wikilink-Syntax
    assert parse_links(f"Kein {wikilink} Link hier.") == []


def test_resolve_relative_and_parent():
    assert resolve_target("01-context/a.md", "b.md") == "01-context/b.md"
    assert resolve_target("01-context/a.md", "../CLAUDE.md") == "CLAUDE.md"


def test_resolve_drops_external_and_anchor():
    assert resolve_target("a.md", "https://example.com") is None
    assert resolve_target("a.md", "#abschnitt") is None
    assert resolve_target("a.md", "b.md#teil") == "b.md"
