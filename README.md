# Vault-Explorer

Eine **lokale Web-App**, die einen Markdown-Vault (Obsidian- bzw. Second-Brain-Verzeichnis)
als **interaktive, durchsuchbare Wissenskarte** darstellt — mit Struktur, Vorschau und
klickbaren Links. Read-only, alles bleibt auf dem eigenen Rechner (kein Cloud-Dienst,
kein Tracking).

Motivation: der native Obsidian-Graph sieht schick aus, hilft im Alltag aber kaum
(keine Cluster, keine Vorschau, keine Navigation, keine gute Suche). Vault-Explorer
liefert genau das.

## Features

- **Graph** — Notizen als Knoten, interne Links als Kanten, je Ordner-Cluster eine
  farbige Wolke. Cluster-Ebene umschaltbar (Bereiche / Domänen / Projekte), isolierte
  Notizen ein-/ausblendbar, Kompaktheits-Regler. Handanordnung wird lokal gemerkt.
  „Neu anordnen" layoutet den ganzen Graph — oder, wenn ein Cluster markiert ist, nur
  dieses.
- **Kuchen** — Vault-Inhalt als Tortendiagramm (ein Stück je Cluster) mit den
  System-Ringen außen; dieselben Filter wie im Graph.
- **System-Ring** — das operative Setup drumherum (Skills, Commands, Memory, MCPs,
  Routines) als konzentrische Ringe. Read-only aus dem lokalen Setup gelesen, MCPs nur
  als Server-Namen (keine Secrets).
- **Suche** — Volltext in allen drei Modi (Notizen im Graph/Kuchen, System-Einträge im
  Ring). **Live-Trefferliste** unter dem Suchfeld (nicht nur der oberste Treffer),
  optional nach **Bereich bzw. Typ gefiltert**. Der gewählte Treffer fliegt an und wird
  im Inspektor geöffnet; der Suchbegriff wird in **Titel und Vorschau** markiert, ein
  **Treffer-Navigator** (◀ n/N ▶) springt durch alle Fundstellen.
- **Inspektor** — Markdown-Vorschau der Notiz mit klickbaren internen Links; externe
  Links (http/https) öffnen in einem neuen Tab. **Zurück/Vorwärts** durch die geöffneten
  Dokumente, **Panel-Breite** per Zieh-Griff anpassbar (lokal gemerkt). „In App öffnen"
  öffnet die Datei im System-Editor.
- **Wartung** — Analysen über Obsidian hinaus: isolierte Notizen (Orphans),
  meistverlinkte Notizen (Hubs), tote Links (Ziel existiert nicht).
- **Vault neu laden** — liest den Vault ohne Server-Neustart frisch ein.

## Stack

- **Backend:** Python / FastAPI — indiziert den Vault read-only, liefert Graph, Such-
  Index, System-Daten und Wartungs-Analysen als JSON.
- **Frontend:** Vite / TypeScript / [Cytoscape.js](https://js.cytoscape.org/) —
  statisches SPA, MiniSearch für die clientseitige Volltextsuche.

## Voraussetzungen

- Python ≥ 3.11
- Node ≥ 18

## Setup

```bash
# Backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"   # ohne [dev] = ohne Test-Abhängigkeiten

# Frontend
cd web && npm install && cd ..
```

## Starten

Zwei Prozesse — Backend (:8000) und Frontend-Dev-Server (:5173, proxyt `/api` → :8000):

```bash
# Terminal 1 — Backend (liest standardmäßig ~/ki-os, siehe Konfiguration)
.venv/bin/python -m uvicorn server.app:app --host 127.0.0.1 --port 8000

# Terminal 2 — Frontend
cd web && npm run dev
```

Dann <http://localhost:5173> öffnen.

## Konfiguration

Alle Pfade sind über Umgebungsvariablen überschreibbar (Defaults in `config.py`):

| Variable | Default | Zweck |
|---|---|---|
| `VAULTX_VAULT` | `~/ki-os` | Vault-Root (die Markdown-Notizen) |
| `VAULTX_CLAUDE_HOME` | `~/.claude` | Skills/Commands für den System-Ring |
| `VAULTX_MEMORY_DIR` | *(setup-spezifisch)* | Memory-Verzeichnis für den System-Ring |
| `VAULTX_MCP_CONFIG` | `~/.claude.json` | MCP-Server-Namen für den System-Ring |
| `VAULTX_ROUTINES` | *(leer)* | optionales Routines-Verzeichnis |
| `VAULTX_DATA` | `./data` | Cache-/Ausgabeverzeichnis |

Nur `VAULTX_VAULT` wird für die drei Vault-Ansichten (Graph/Kuchen/Suche) gebraucht.
Der System-Ring ist optional — fehlende Quellen lassen einfach ihren Ring leer.

## Annahmen an den Vault

- Interne Links als **Standard-Markdown** `[text](pfad/datei.md)` — **keine**
  Obsidian-Wikilinks (`[[…]]`).
- YAML-Frontmatter (`type`, `tags`, …) wird geparst, ist aber optional.
- Der Ordner `05-daily/` (Tageslogs) wird aus dem Graphen herausgehalten, bleibt aber
  durchsuchbar.

## Tests

```bash
.venv/bin/python -m pytest
```

## Lizenz

[MIT](LICENSE)
