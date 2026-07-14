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
# Setup-spezifisch (der Pfad enthält den Projekt-Slug) → kein sinnvoller Default;
# per VAULTX_MEMORY_DIR setzen. None → Memory-Segment im System-Ring bleibt leer.
MEMORY_DIR = _p("VAULTX_MEMORY_DIR", None)
MCP_CONFIG = _p("VAULTX_MCP_CONFIG", "~/.claude.json")
ROUTINES_DIR = _p("VAULTX_ROUTINES", None)  # optional; None → Segment leer
DATA_DIR = _p("VAULTX_DATA", "./data")
