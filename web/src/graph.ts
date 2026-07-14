// web/src/graph.ts
import cytoscape, { Core, ElementDefinition, NodeSingular } from "cytoscape";
import fcose from "cytoscape-fcose";
import type { GraphData } from "./api";
import { loadState, saveState, loadPositions, savePositions, clearPositions } from "./store";

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
  relayout: () => void;
  initial: { depth: number; orphansShown: boolean; compaction: number };
}

/** Daily Logs (05-daily) gehören nicht in den Graph — verwässern nur die Struktur. */
const isDaily = (id: string, area: string) =>
  area === "05-daily" || id.startsWith("05-daily/");

/** Cluster-Schlüssel je Notiz = Ordnerpfad bis zur gewählten Tiefe. */
function clusterKey(id: string, depth: number): string {
  const folders = id.split("/").slice(0, -1);
  if (folders.length === 0) return "(root)";
  return folders.slice(0, depth).join("/");
}

const clusterId = (key: string) => `cl::${key}`;
const clusterLabel = (key: string) => key.split("/").pop() ?? key;

/** Cluster mit weniger als so vielen Notizen werden in ihren Elternbereich gefaltet. */
const MERGE_MIN = 4;
/** Default-Kompaktheit (Slider-Wert); 100 = Layout-Abstand, kleiner = enger. */
const DEFAULT_COMPACT = 62;

/** Distinkte Farbe je Cluster, Hue per Goldenem Winkel verteilt. */
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
 * Kleine Cluster (< MERGE_MIN) werden in ihren Elternbereich gefaltet.
 * Knoten ohne jede Kante werden als `orphan` markiert.
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

  const raw = new Map(notes.map((n) => [n.id, clusterKey(n.id, depth)]));
  const rawCount = new Map<string, number>();
  for (const k of raw.values()) rawCount.set(k, (rawCount.get(k) ?? 0) + 1);
  const keyOf = new Map<string, string>();
  for (const n of notes) {
    const r = raw.get(n.id)!;
    let k = r;
    if (depth > 1 && (rawCount.get(r) ?? 0) < MERGE_MIN) {
      const parent = clusterKey(n.id, depth - 1);
      if (parent !== r) k = parent;
    }
    keyOf.set(n.id, k);
  }

  const keys = [...new Set(keyOf.values())];
  const colors = clusterColors(keys);

  // Labels: normalerweise nur der Ordnername (letztes Segment). Kommt derselbe Name in
  // mehreren Bereichen vor (z.B. "gesundheit" unter 04-projects UND 10-wissen), wird der
  // übergeordnete Ordner zur Unterscheidung angehängt ("gesundheit · 10-wissen").
  const lastCount = new Map<string, number>();
  for (const k of keys) lastCount.set(clusterLabel(k), (lastCount.get(clusterLabel(k)) ?? 0) + 1);
  const labelOf = new Map<string, string>();
  for (const k of keys) {
    const segs = k.split("/");
    const last = segs[segs.length - 1];
    labelOf.set(
      k,
      (lastCount.get(last) ?? 0) > 1 && segs.length > 1 ? `${last} · ${segs[segs.length - 2]}` : last,
    );
  }

  const hasConnected = new Map<string, boolean>(keys.map((k) => [k, false]));
  for (const n of notes) if (!isOrphan(n.id)) hasConnected.set(keyOf.get(n.id)!, true);

  const els: ElementDefinition[] = [];

  for (const k of keys) {
    els.push({
      data: { id: clusterId(k), label: labelOf.get(k), color: colors.get(k) ?? "#6ea8fe" },
      classes: "area" + (hasConnected.get(k) ? "" : " orphan"),
      grabbable: true,
      selectable: false,
    });
  }

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
        // Compound-Hülle selbst unsichtbar — den sichtbaren "Wolken"-Look zeichnet hulls.ts.
        // Bleibt als Klick-/Zieh-Bereich (ganzes Cluster) + trägt das Label.
        selector: "node.area",
        style: {
          "background-opacity": 0,
          "border-width": 0,
          label: "data(label)",
          "font-size": 17,
          "font-weight": "bold",
          color: "data(color)",
          "text-valign": "top",
          "text-halign": "center",
          "text-margin-y": 10, // etwas tiefer, in die Wolke hinein
          "text-opacity": 1,
          "text-background-color": "#0e1116",
          "text-background-opacity": 0.5,
          "text-background-padding": 3,
          "text-background-shape": "round-rectangle",
          padding: 12,
          "z-index": 4,
        },
      },
      {
        selector: "edge",
        style: {
          "line-color": "#7f8ba1",
          width: 1,
          opacity: 0.3,
          "curve-style": "straight",
          "target-arrow-shape": "none",
          events: "no", // Kanten fangen keine Klicks ab → Knoten/Hüllen bleiben treffbar
        },
      },
      { selector: "node.faded", style: { opacity: 0.28, "text-opacity": 0 } },
      { selector: "edge.faded", style: { opacity: 0.05 } },
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
      // Zentraler Knoten (Hover/Klick): großer, hinterlegter Text → klar hervorgehoben.
      {
        selector: "node.center",
        style: {
          label: "data(label)",
          "font-size": 19,
          "font-weight": "bold",
          color: "#ffffff",
          "text-opacity": 1,
          "text-background-color": "#0e1116",
          "text-background-opacity": 0.72,
          "text-background-padding": 3,
          "text-background-shape": "round-rectangle",
          "border-width": 3,
          "border-color": "#ffffff",
          "z-index": 50,
        },
      },
      { selector: ".off", style: { display: "none" } },
    ],
    wheelSensitivity: 0.2,
  });

  // Zustand aus localStorage laden (Handanordnung überlebt Reload + Server-Neustart).
  const st = loadState();
  let depth = st.depth ?? 2;
  let orphansShown = st.orphansShown ?? false;
  let globalCompact = st.globalCompact ?? DEFAULT_COMPACT;
  const compact = new Map<string, number>(Object.entries(st.compact ?? {}));
  let selected: string | null = null;
  let selCb: (name: string | null, value: number) => void = () => {};
  let saveTimer = 0;

  function persistPositions() {
    const pos: Record<string, { x: number; y: number }> = {};
    cy.nodes(".note").forEach((n) => {
      const p = n.position();
      pos[n.id()] = { x: Math.round(p.x), y: Math.round(p.y) };
    });
    savePositions(depth, pos);
  }
  function persistPositionsDebounced() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persistPositions, 300);
  }
  function persistState() {
    saveState({ depth, orphansShown, globalCompact, compact: Object.fromEntries(compact) });
  }

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

  /** Neuer Knoten ohne gespeicherte Position: nahe den Geschwistern seines Clusters absetzen. */
  function placeInCluster(n: NodeSingular) {
    const sibs = n.parent().children().filter((c) => c.id() !== n.id() && c.position("x") !== 0);
    if (!sibs.length) return;
    let cx = 0;
    let cyy = 0;
    sibs.forEach((c) => {
      cx += c.position("x");
      cyy += c.position("y");
    });
    n.position({ x: cx / sibs.length + (Math.random() - 0.5) * 40, y: cyy / sibs.length + (Math.random() - 0.5) * 40 });
  }

  function finishLayout() {
    if (orphansShown) cy.elements(".orphan").removeClass("off");
    else cy.elements(".orphan").addClass("off");
    cy.nodes(".area").removeClass("sel");
    selected = null;
    selCb(null, globalCompact);
    requestAnimationFrame(() => {
      cy.resize();
      cy.fit(cy.elements(":visible"), 50);
      applyLabelZoom();
    });
  }

  function render() {
    cy.elements().remove();
    cy.add(buildElements(data, depth));
    selected = null;

    const saved = loadPositions(depth);
    const notes = cy.nodes(".note");
    const covered = saved ? notes.filter((n) => saved[n.id()]).length : 0;

    if (saved && notes.length > 0 && covered >= notes.length * 0.6) {
      // Gespeicherte Anordnung wiederherstellen (kein Neu-Layout).
      notes.forEach((n) => {
        const p = saved[n.id()];
        if (p) n.position(p);
      });
      notes.forEach((n) => {
        if (!saved[n.id()]) placeInCluster(n as NodeSingular);
      });
      finishLayout();
    } else {
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
        cy.nodes(".area").forEach((p) => {
          const v = compact.get(p.id()) ?? globalCompact;
          compact.set(p.id(), v);
          scaleCluster(p as NodeSingular, v / 100);
        });
        persistPositions();
        finishLayout();
      });
      layout.run();
    }
  }

  function highlight(node: NodeSingular) {
    const hood = node.closedNeighborhood();
    cy.elements("node.note, edge").addClass("faded");
    hood.removeClass("faded").addClass("hl");
    node.addClass("center"); // der Knoten selbst hebt sich mit großem Text von den Nachbarn ab
  }
  function clear() {
    cy.elements().removeClass("faded hl center");
  }

  function selectCluster(parentId: string | null) {
    selected = parentId;
    cy.nodes(".area").removeClass("sel");
    if (parentId) {
      const node = cy.getElementById(parentId);
      node.addClass("sel");
      selCb(node.data("label"), compact.get(parentId) ?? globalCompact);
    } else {
      selCb(null, globalCompact);
    }
  }

  // Nur EIN Cluster neu sortieren: fcose auf dessen Kinder + interne Kanten,
  // Ergebnis auf den alten Schwerpunkt zurückschieben (Cluster bleibt am Ort),
  // dann die gespeicherte Kompaktheit erneut anwenden.
  function relayoutCluster(parentId: string) {
    const parent = cy.getElementById(parentId) as unknown as NodeSingular;
    const kids = parent.children();
    if (kids.length < 2) return;
    let cx0 = 0;
    let cy0 = 0;
    kids.forEach((k) => { cx0 += k.position("x"); cy0 += k.position("y"); });
    cx0 /= kids.length;
    cy0 /= kids.length;

    const edges = kids.edgesWith(kids); // nur clusterinterne Kanten
    const layout = kids.union(edges).layout({
      name: "fcose",
      animate: false,
      randomize: true,
      quality: "proof",
      nodeSeparation: 120,
      nodeRepulsion: 20000,
      idealEdgeLength: 40,
      edgeElasticity: 0.5,
      gravity: 0.25,
    } as any);
    layout.one("layoutstop", () => {
      // neuen Schwerpunkt bestimmen und alles auf den alten zurückschieben
      let nx = 0;
      let ny = 0;
      kids.forEach((k) => { nx += k.position("x"); ny += k.position("y"); });
      nx /= kids.length;
      ny /= kids.length;
      kids.forEach((k) => { k.position({ x: k.position("x") - nx + cx0, y: k.position("y") - ny + cy0 }); });
      const v = compact.get(parentId) ?? globalCompact;
      scaleCluster(parent, v / 100); // Kompaktheit dieses Clusters wiederherstellen
      persistPositions();
    });
    layout.run();
  }

  let pinned: string | null = null;

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
  // Verschieben (Knoten oder ganze Hülle) → Anordnung speichern.
  cy.on("dragfree", "node", () => persistPositions());

  // Cluster-Namen zoom-kompensiert: Schriftgröße invers zum Zoom → nahezu konstante
  // Bildschirmgröße (rausgezoomt lesbar statt winzig, reingezoomt nicht überfüllend).
  const LABEL_SCREEN_PX = 14;
  function applyLabelZoom() {
    cy.nodes(".area").style(
      "font-size",
      Math.max(5, Math.min(120, LABEL_SCREEN_PX / cy.zoom())),
    );
  }
  cy.on("zoom", applyLabelZoom);

  render();

  const controller: GraphController = {
    cy,
    initial: { depth, orphansShown, compaction: globalCompact },
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
      persistState();
    },
    setClusterDepth: (d) => {
      depth = d;
      render();
      persistState();
    },
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
      persistPositionsDebounced();
      persistState();
    },
    onSelectionChange: (cb) => {
      selCb = cb;
    },
    // Ist ein Cluster markiert → nur dieses neu sortieren; sonst gespeicherte
    // Anordnung dieser Ebene verwerfen und den ganzen Graph frisch layouten.
    relayout: () => {
      if (selected) {
        relayoutCluster(selected);
        return;
      }
      clearPositions(depth);
      compact.clear();
      globalCompact = DEFAULT_COMPACT;
      render();
      persistState();
    },
  };
  return controller;
}
