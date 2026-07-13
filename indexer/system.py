"""Orchestriert die Ring-Adapter zu einem Inventar nach Segmenten.
Jeder Adapter läuft durch safe(), sodass eine fehlende Quelle nie den Ring bricht.

Skills und Commands werden aus zwei Quellen zusammengeführt: den globalen unter
~/.claude/ und den Vault-eigenen unter <vault>/.claude/ — so zeigt der Ring das
vollständige System, nicht nur die globalen Bausteine."""
from pathlib import Path

import config
from .adapters import safe, skills, commands, memory, mcps, routines


def build_system(
    claude_home: Path | None = None,
    memory_dir: Path | None = None,
    mcp_config: Path | None = None,
    routines_dir: Path | None = None,
    vault_root: Path | None = None,
) -> dict:
    claude_home = claude_home or config.CLAUDE_HOME
    memory_dir = memory_dir or config.MEMORY_DIR
    mcp_config = mcp_config or config.MCP_CONFIG
    routines_dir = routines_dir if routines_dir is not None else config.ROUTINES_DIR
    vault_root = vault_root or config.VAULT_ROOT

    vault_claude = vault_root / ".claude"
    skill_roots = [(vault_claude / "skills", "vault")]
    command_roots = [vault_claude / "commands"]

    segments = {
        "skills": safe(skills.collect, "skills")(claude_home, skill_roots),
        "commands": safe(commands.collect, "commands")(claude_home, command_roots),
        "memory": safe(memory.collect, "memory")(memory_dir),
        "mcps": safe(mcps.collect, "mcps")(mcp_config),
        "routines": safe(routines.collect, "routines")(routines_dir),
    }
    counts = {k: len(v) for k, v in segments.items()}
    return {"segments": segments, "counts": counts}
