"""Segment 'mcps': mcpServers-Schlüssel aus der Claude-Config.

Sicherheit: es werden AUSSCHLIESSLICH die Server-Namen (die Keys von
mcpServers) gelesen — niemals die Werte (command/args/env), die Tokens und
API-Keys enthalten. Nichts Sensibles landet im Ring."""
import json
from pathlib import Path


def collect(mcp_config: Path) -> list[dict]:
    if not mcp_config or not Path(mcp_config).exists():
        return []
    data = json.loads(Path(mcp_config).read_text(encoding="utf-8"))
    servers = data.get("mcpServers", {})
    return [
        {"id": f"mcp:{name}", "label": name, "segment": "mcps", "meta": {}}
        for name in sorted(servers)
    ]
