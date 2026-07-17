import json
import textwrap
from pathlib import Path

import pytest

# Fixtures immer utf-8 schreiben — sonst nutzt Windows cp1252 und Umlaute
# (z. B. "Kärcher-Sync") zerbrechen beim späteren utf-8-Lesen.
UTF8 = {"encoding": "utf-8"}


@pytest.fixture
def mini_vault(tmp_path: Path) -> Path:
    """Winziges Vault:
      CLAUDE.md            -> verlinkt a und b
      01-context/a.md      -> verlinkt b (relativ ../) und einen TOTEN Link
      01-context/b.md      -> Orphan-Ziel? nein, wird von a + CLAUDE verlinkt
      04-projects/orphan.md-> niemand verlinkt drauf (Orphan)
      _papierkorb/x.md     -> muss IGNORIERT werden
      .claude/skills/s/SKILL.md -> muss IGNORIERT werden (kein Vault-Wissen)
    """
    root = tmp_path / "vault"
    (root / "01-context").mkdir(parents=True)
    (root / "04-projects").mkdir(parents=True)
    (root / "_papierkorb").mkdir(parents=True)
    (root / ".claude" / "skills" / "s").mkdir(parents=True)

    (root / "CLAUDE.md").write_text(
        "# Regelwerk\nSiehe [A](01-context/a.md) und [B](01-context/b.md).\n", **UTF8
    )
    (root / "01-context" / "a.md").write_text(
        textwrap.dedent("""\
        ---
        type: note
        tags: [test]
        ---
        # Notiz A
        Link zu [B](b.md) und ein [toter Link](fehlt.md).
        Externer [Link](https://example.com) und ein ![Bild](../img.png).
        """), **UTF8
    )
    (root / "01-context" / "b.md").write_text("# Notiz B\nKein Auslink.\n", **UTF8)
    (root / "04-projects" / "orphan.md").write_text("# Waise\nNiemand verlinkt mich.\n", **UTF8)
    (root / "_papierkorb" / "x.md").write_text("# Müll\n[A](../01-context/a.md)\n", **UTF8)
    (root / ".claude" / "skills" / "s" / "SKILL.md").write_text("# Skill s\n", **UTF8)
    return root


@pytest.fixture
def mini_claude(tmp_path: Path) -> Path:
    """Mini-~/.claude für Ring-Adapter."""
    home = tmp_path / "claude"
    (home / "skills" / "bridge").mkdir(parents=True)
    (home / "commands").mkdir(parents=True)
    (home / "skills" / "bridge" / "SKILL.md").write_text(
        "---\ndescription: Kärcher-Sync\n---\n# bridge\n", **UTF8
    )
    (home / "commands" / "start.md").write_text("# Start\nSession starten.\n", **UTF8)
    return home


@pytest.fixture
def mini_memory(tmp_path: Path) -> Path:
    mem = tmp_path / "memory"
    mem.mkdir()
    (mem / "MEMORY.md").write_text(
        "# Memory Index\n- [Regel X](feedback_x.md) — kurz\n", **UTF8
    )
    (mem / "feedback_x.md").write_text(
        "---\nname: feedback_x\ndescription: Regel X\n---\nInhalt.\n", **UTF8
    )
    return mem


@pytest.fixture
def mini_mcp_config(tmp_path: Path) -> Path:
    cfg = tmp_path / "claude.json"
    cfg.write_text(json.dumps({"mcpServers": {"things3": {}, "oura": {}}}), **UTF8)
    return cfg
