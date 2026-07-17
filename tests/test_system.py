# tests/test_system.py
from pathlib import Path

from indexer.adapters import safe, skills, commands, memory, mcps, routines
from indexer.system import build_system


def test_skills_adapter_reads_description(mini_claude):
    items = skills.collect(mini_claude)
    bridge = next(i for i in items if i["label"] == "bridge")
    assert bridge["segment"] == "skills"
    assert bridge["meta"]["beschreibung"] == "Kärcher-Sync"


def test_safe_wrapper_swallows_errors():
    def boom(_):
        raise RuntimeError("kaputt")
    assert safe(boom, "skills")(None) == []


def test_commands_adapter(mini_claude):
    items = commands.collect(mini_claude)
    assert {"start"} <= {i["label"] for i in items}
    assert all(i["segment"] == "commands" for i in items)


def test_memory_adapter(mini_memory):
    items = memory.collect(mini_memory)
    x = next(i for i in items if i["label"] == "feedback_x")
    assert x["segment"] == "memory"
    assert x["meta"]["beschreibung"] == "Regel X"


def test_mcps_adapter_reads_config(mini_mcp_config):
    items = mcps.collect(mini_mcp_config)
    assert {"things3", "oura"} == {i["label"] for i in items}
    assert all(i["segment"] == "mcps" for i in items)


def test_mcps_missing_config_no_crash():
    assert mcps.collect(Path("/does/not/exist.json")) == []


def test_routines_none_source():
    assert routines.collect(None) == []


def test_build_system_groups_segments(mini_claude, mini_memory, mini_mcp_config, tmp_path):
    result = build_system(
        claude_home=mini_claude, memory_dir=mini_memory,
        mcp_config=mini_mcp_config, routines_dir=None,
        vault_root=tmp_path / "leerer-vault",   # existiert nicht → keine Vault-Skills/Commands
    )
    segs = result["segments"]
    assert {i["label"] for i in segs["skills"]} == {"bridge"}
    assert {i["label"] for i in segs["mcps"]} == {"things3", "oura"}
    assert segs["routines"] == []          # None-Quelle → leer, kein Crash


def test_build_system_includes_vault_skills(mini_claude, tmp_path):
    """Vault-eigene .claude/skills tauchen zusätzlich zu den globalen auf."""
    vault = tmp_path / "vault"
    (vault / ".claude" / "skills" / "produktcheck").mkdir(parents=True)
    (vault / ".claude" / "skills" / "produktcheck" / "SKILL.md").write_text(
        "---\ndescription: Produktberatung\n---\n# produktcheck\n", encoding="utf-8"
    )
    result = build_system(
        claude_home=mini_claude, memory_dir=tmp_path / "no-mem",
        mcp_config=tmp_path / "no.json", routines_dir=None, vault_root=vault,
    )
    labels = {i["label"] for i in result["segments"]["skills"]}
    assert labels == {"bridge", "produktcheck"}
