// web/src/graph.ts
import cytoscape, { Core, ElementDefinition, NodeSingular } from "cytoscape";
import fcose from "cytoscape-fcose";
import type { GraphData } from "./api";

cytoscape.use(fcose);

export interface GraphController {
  cy: Core;
  onNodeClick: (cb: (id: string) => void) => void;
  flyTo: (id: string) => void;
  focus: (id: string) => void;
  clearFocus: () => void;
  showOrphans: (show: boolean) => void;
  setClusterDepth: (depth: number) => void;
  setCompaction: (value: number) => void;
  onSelectionChange: (cb: (name: string | null, value: number) => void) => void;
}

/** Daily Logs (05-daily) gehören nicht in den Graph — verwässern nur die Struktur. */
const isDaily = (id: string, area: string) =>
  area === "05-daily" || id.startsWith("05-daily/");

/** Cluster-Schlüssel je Notiz = Ordnerpfad bis zur gewählten Tiefe. */
function clusterKey(id: string, depth: number): string {
  const folders = id.split("/").slice(0, -1); // Dateinamen abschneiden
  if (folders.length === 0) return "(root)";
  return folders.slice(0, depth).join("/");
}

const clusterId = (key: string) => `cl::${key}`;
const clusterLabel = (key: string) => key.split("/").pop() ?? key;

/** Cluster mit weniger als so vielen Notizen werden in ihren Elternbereich gefaltet. */
const MERGE_MIN = 4;
/** Default-Kompaktheit (Slider-Wert); 100 = Layout-Abstand, kleiner = enger. */
const DEFAULT_COMPACT = 62;

/**
 * Distinkte Farbe je Cluster. Hue per Goldenem Winkel (137.5°) verteilt, damit
 * alphabetisch benachbarte Cluster klar verschiedene Farben bekommen.
 */
function clusterColors(keys: string[]): Map<string, string> {
  const sorted = [...keys].sort();
  const m = new Map<string, string>();
  sorted.forEach((k, i) => {
    const hue = Math.round((i * 137.508) % 360);
    const sat = 58 + (i % 3) * 8;
    m.set(k, `hsl(${hue}, ${sat}%, 61%)`);
  });
  return m;
}

/**
 * Baut die Cytoscape-Elemente: je Cluster eine Compound-Hülle (in Cluster-Farbe),
 * die Notizen als gleichfarbige Kinder darin, interne Links als Kanten. Daily Logs raus.
 * Kleine Cluster (< MERGE_MIN) werden in ihren Elternbereich (eine Ebene höher) gefaltet.
 * Knoten ohne jede Kante werden als `orphan` markiert (per Toggle ausblendbar).
 */
function buildElements(data: GraphData, depth: number): ElementDefinition[] {
  const notes = data.nodes.filter((n) => !isDaily(n.id, n.area));
  const shown = new Set(notes.map((n) => n.id));
  const edges = data.edges.filter((e) => shown.has(e.source) && shown.has(e.target));

  const deg = new Map<string, number>();
  for (const e of edges) {
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
  }
  const isOrphan = (id: string) => (deg.get(id) ?? 0) === 0;

  // Rohe Keys je Tiefe, dann kleine Cluster in den Elternbereich falten.
  const raw = new Map(notes.map((n) => [n.id, clusterKey(n.id, depth)]));
  const rawCount = new Map<string, number>();
  for (const k of raw.values()) rawCount.set(k, (rawCount.get(k) ?? 0) + 1);
  const keyOf = new Map<string, string>();
  for (const n of notes) {
    const r = raw.get(n.id)!;
    let k = r;
    if (depth > 1 && (rawCount.get(r) ?? 0) < MERGE_MIN) {
      const parent = clusterKey(n.id, depth - 1);
      if (parent !== r) k = parent; // eine Ebene höher zusammenfassen
    }
    keyOf.set(n.id, k);
  }

  const keys = [...new Set(keyOf.values())];
  const colors = clusterColors(keys);

  const hasConnected = new Map<string, boolean>(keys.map((k) => [k, false]));
  for (const n of notes) if (!isOrphan(n.id)) hasConnected.set(keyOf.get(n.id)!, true);

  const els: ElementDefinition[] = [];

  // Compound-Hüllen (Cluster) — ziehbar, damit man das ganze Cluster verschieben kann.
  for (const k of keys) {
    els.push({
      data: { id: clusterId(k), label: clusterLabel(k), color: colors.get(k) ?? "#6ea8fe" },
      classes: "area" + (hasConnected.get(k) ? "" : " orphan"),
      grabbable: true,
      selectable: false,
    });
  }

  // Notiz-Knoten — gleiche Farbe wie die Hülle. Einzeln ziehbar (frei umordnen);
  // die Hülle bleibt zusätzlich als Ganzes ziehbar (ganzes Cluster verschieben).
  for (const n of notes) {
    const k = keyOf.get(n.id)!;
    els.push({
      data: {
        id: n.id,
        label: n.label,
        size: n.size,
        color: colors.get(k) ?? "#6ea8fe",
        parent: clusterId(k),
      },
      classes: "note" + (isOrphan(n.id) ? " orphan" : ""),
      grabbable: true,
    });
  }

  for (const e of edges) {
    els.push({ data: { id: `${e.source}=>${e.target}`, source: e.source, target: e.target } });
  }

  return els;
}

export function initGraph(container: HTMLElement, data: GraphData): GraphController {
  const cy = cytoscape({
    container,
    elements: [],
    style: [
      {
        selector: "node.note",
        style: {
          "background-color": "data(color)",
          width: "mapData(size, 0, 40, 12, 46)",
          height: "mapData(size, 0, 40, 12, 46)",
          "border-width": 0,
          label: "",
          "font-size": 10,
          color: "#eef2f8",
          "text-outline-color": "#0e1116",
          "text-outline-width": 2,
          "text-valign": "center",
          "text-halign": "center",
          "z-index": 10,
        },
      },
      {
        selector: "node.area",
        style: {
          "background-color": "data(color)", // gleiche Farbe wie die Kinder, nur transparent gefüllt
          "background-opacity": 0.05,
          "border-color": "data(color)",
          "border-width": 1.5,
          "border-opacity": 0.6,
          shape: "round-rectangle",
          label: "data(label)",
          "font-size": 14,
          "font-weight": "bold",
          color: "data(color)",
          "text-valign": "top",
          "text-halign": "center",
          "text-margin-y": 2,
          "text-opacity": 0.9,
          padding: 16,
          "z-index": 1,
        },
      },
      // Ausgewähltes Cluster (Slider wirkt dann nur auf dieses).
      {
        selector: "node.area.sel",
        style: { "border-width": 3, "border-opacity": 1, "background-opacity": 0.1 },
      },
      {
        selector: "edge",
        style: {
          "line-color": "#7f8ba1",
          width: 1,
          opacity: 0.3,
          "curve-style": "straight",
          "target-arrow-shape": "none",
        },
      },
      { selector: ".faded", style: { opacity: 0.05, "text-opacity": 0 } },
      {
        selector: "node.hl",
        style: {
          label: "data(label)",
          opacity: 1,
          "border-width": 2,
          "border-color": "#eef2f8",
          "z-index": 30,
        },
      },
      { selector: "edge.hl", style: { "line-color": "#9db4d8", width: 1.6, opacity: 0.9, "z-index": 20 } },
      { selector: "node.pin", style: { "border-width": 3, "border-color": "#ffffff" } },
      { selector: ".off", style: { display: "none" } },
    ],
    wheelSensitivity: 0.2,
  });

  let depth = 2;
  let orphansShown = false;
  let pinned: string | null = null;

  // Kompaktheit: pro Cluster (parent-id → Slider-Wert) + globaler Wert + Auswahl.
  const compact = new Map<string, number>();
  let globalCompact = DEFAULT_COMPACT;
  let selected: string | null = null; // parent-id des gewählten Clusters
  let selCb: (name: string | null, value: number) => void = () => {};

  /** Zieht die Kinder eines Clusters um ratio zu ihrem Schwerpunkt zusammen (>1 = weiter). */
  function scaleCluster(parent: NodeSingular, ratio: number) {
    if (ratio === 1) return;
    const kids = parent.children();
    if (kids.length < 2) return;
    let cx = 0;
    let cyy = 0;
    kids.forEach((k) => {
      cx += k.position("x");
      cyy += k.position("y");
    });
    cx /= kids.length;
    cyy /= kids.length;
    kids.forEach((k) =>
      k.position({ x: cx + (k.position("x") - cx) * ratio, y: cyy + (k.position("y") - cyy) * ratio }),
    );
  }

  function render() {
    cy.elements().remove();
    cy.add(buildElements(data, depth));
    pinned = null;
    selected = null;

    const sameCluster = (edge: any) => {
      const sp = edge.source().parent().id();
      const tp = edge.target().parent().id();
      return sp !== undefined && sp === tp;
    };
    const layout = cy.layout({
      name: "fcose",
      animate: false,
      randomize: true,
      quality: "proof",
      nodeSeparation: 120,
      nodeRepulsion: 20000,
      idealEdgeLength: (edge: any) => (sameCluster(edge) ? 40 : 280),
      edgeElasticity: (edge: any) => (sameCluster(edge) ? 0.5 : 0.05),
      gravity: 0.06,
      gravityCompound: 2.6,
      gravityRangeCompound: 2.0,
      packComponents: true,
      tile: true,
    } as any);
    layout.one("layoutstop", () => {
      if (!orphansShown) cy.elements(".orphan").addClass("off");
      // Default-Kompaktheit anwenden (Layout = 100 → DEFAULT_COMPACT).
      compact.clear();
      cy.nodes(".area").forEach((p) => {
        compact.set(p.id(), globalCompact);
        scaleCluster(p as NodeSingular, globalCompact / 100);
      });
      cy.nodes(".area").removeClass("sel");
      selCb(null, globalCompact);
      requestAnimationFrame(() => {
        cy.resize();
        cy.fit(cy.elements(":visible"), 50);
      });
    });
    layout.run();
  }

  function highlight(node: NodeSingular) {
    const hood = node.closedNeighborhood();
    cy.elements("node.note, edge").addClass("faded");
    hood.removeClass("faded").addClass("hl");
  }
  function clear() {
    cy.elements().removeClass("faded hl");
  }

  function selectCluster(parentId: string | null) {
    selected = parentId;
    cy.nodes(".area").removeClass("sel");
    if (parentId) {
      cy.getElementById(parentId).addClass("sel");
      selCb(clusterLabel(parentId.replace("cl::", "")), compact.get(parentId) ?? globalCompact);
    } else {
      selCb(null, globalCompact);
    }
  }

  // Handler einmal delegiert an cy binden → überleben das Neu-Rendern beim Ebenenwechsel.
  cy.on("mouseover", "node.note", (e) => {
    if (!pinned) highlight(e.target);
  });
  cy.on("mouseout", "node.note", () => {
    if (!pinned) clear();
  });
  cy.on("tap", "node.area", (e) => selectCluster(e.target.id()));
  cy.on("tap", (e) => {
    if (e.target === cy) selectCluster(null);
  });

  render();

  const controller: GraphController = {
    cy,
    onNodeClick: (cb) => cy.on("tap", "node.note", (e) => cb(e.target.id())),
    flyTo: (id) => {
      const el = cy.getElementById(id);
      if (el.length) cy.animate({ center: { eles: el }, zoom: 1.4 }, { duration: 400 });
    },
    focus: (id) => {
      const node = cy.getElementById(id);
      if (!node.length) return;
      node.removeClass("off");
      node.parent().removeClass("off");
      pinned = id;
      clear();
      cy.nodes().removeClass("pin");
      node.addClass("pin");
      highlight(node as unknown as NodeSingular);
    },
    clearFocus: () => {
      pinned = null;
      clear();
      cy.nodes().removeClass("pin");
    },
    showOrphans: (show) => {
      orphansShown = show;
      const orphans = cy.elements(".orphan");
      if (show) orphans.removeClass("off");
      else orphans.addClass("off");
    },
    setClusterDepth: (d) => {
      depth = d;
      render();
    },
    // Kompaktheit setzen: auf das gewählte Cluster, sonst global auf alle.
    setCompaction: (value) => {
      if (selected) {
        const p = cy.getElementById(selected) as unknown as NodeSingular;
        const prev = compact.get(selected) ?? globalCompact;
        scaleCluster(p, value / prev);
        compact.set(selected, value);
      } else {
        globalCompact = value;
        cy.nodes(".area").forEach((p) => {
          const prev = compact.get(p.id()) ?? DEFAULT_COMPACT;
          scaleCluster(p as NodeSingular, value / prev);
          compact.set(p.id(), value);
        });
      }
    },
    onSelectionChange: (cb) => {
      selCb = cb;
    },
  };
  return controller;
}
