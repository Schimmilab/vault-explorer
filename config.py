"""Default-Pfade für CLI + Server. Alle über Umgebungsvariablen überschreibbar,
damit Tests eigene Fixture-Pfade injizieren können."""
import os
from pathlib import Path


def _p(env: str, default: str | None) -> Path | None:
    val = os.environ.get(env)
    if val:
        return Path(val).expanduser()
    return Path(default).expanduser() if default else None


VAULT_ROOT = _p("VAULTX_VAULT", "~/ki-os")
CLAUDE_HOME = _p("VAULTX_CLAUDE_HOME", "~/.claude")
MEMORY_DIR = _p(
    "VAULTX_MEMORY_DIR",
    "~/.claude/projects/-Users-jurgenschilling-workspace-ki-os/memory",
)
MCP_CONFIG = _p("VAULTX_MCP_CONFIG", "~/.claude.json")
ROUTINES_DIR = _p("VAULTX_ROUTINES", None)  # optional; None → Segment leer
DATA_DIR = _p("VAULTX_DATA", "./data")
