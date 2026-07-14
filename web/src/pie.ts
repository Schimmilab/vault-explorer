// web/src/pie.ts
// Dritter View-Modus: "Kuchen" — vereint Vault-Inhalt und System in EINER Ansicht.
//  • INNEN: Kuchendiagramm des Vault-Inhalts. Jeder Bereich (Top-Ordner) ist ein
//    GLEICH BREITES Tortenstück; die radiale Länge variiert nach Dokumentenmenge.
//  • AUSSEN: konzentrische System-Ringe (Skills → Commands → MCPs), MCPs als
//    äußerste Schicht zur "Außenwelt" — wie im System-Ring.
import cytoscape, { Core } from "cytoscape";
import type { GraphData, GraphNode, SystemData, SystemItem } from "./api";

const TAU = Math.PI * 2;

const isDaily = (id: string, area: string) =>
  area === "05-daily" || id.startsWith("05-daily/");

/** Äußere System-Ringe von innen nach außen (MCPs ganz außen = Außenwelt). */
const SYS_RINGS: { key: string; color: string; title: string }[] = [
  { key: "skills", color: "#6ea8fe", title: "Skills" },
  { key: "commands", color: "#7ee787", title: "Commands" },
  { key: "mcps", color: "#d2a8ff", title: "MCPs" },
];

/** Farbe je Bereich über den Goldenen Winkel → benachbarte Stücke gut trennbar. */
function areaColors(areas: string[]): Map<string, string> {
  const m = new Map<string, string>();
  areas.forEach((a, i) => {
    const hue = Math.round((i * 137.508) % 360);
    const sat = 58 + (i % 3) * 8;
    m.set(a, `hsl(${hue}, ${sat}%, 61%)`);
  });
  return m;
}

export interface PieController {
  cy: Core;
  show: () => void;
  hide: () => void;
  onNodeClick: (cb: (id: string) => void) => void;
  onSystemClick: (cb: (item: SystemItem) => void) => void;
  /** Einen Eintrag (Notiz oder System-Item) zentrieren + markieren. false, wenn nicht vorhanden. */
  focus: (id: string) => boolean;
  clearSelection: () => void;
}

export function initPie(
  container: HTMLElement,
  guideCanvas: HTMLCanvasElement,
  data: GraphData,
  system: SystemData,
): PieController {
  // Notizen nach Bereich gruppieren (Daily raus).
  const byArea = new Map<string, GraphNode[]>();
  for (const n of data.nodes) {
    if (isDaily(n.id, n.area)) continue;
    const arr = byArea.get(n.area);
    if (arr) arr.push(n); else byArea.set(n.area, [n]);
  }
  const areas = [...byArea.keys()].sort();
  const colors = areaColors(areas);

  const R0 = 70;        // innerer Radius um die Nabe
  const NODE_GAP = 16;  // Ziel-Abstand benachbarter Knoten (Modell-px)
  const ROW = 16;       // radialer Reihenabstand
  const SEG_GAP = 0.05; // Winkel-Lücke zwischen zwei Stücken (rad)
  const SEG_ANGLE = TAU / areas.length; // ALLE Segmente gleich breit

  const elements: cytoscape.ElementDefinition[] = [{
    data: { id: "pie::hub", label: "Vault" }, classes: "hub",
    position: { x: 0, y: 0 }, grabbable: false, selectable: false,
  }];

  const boundaries: number[] = []; // Grenzwinkel vor jedem Segment
  const segRmax: number[] = [];    // Außenradius je Segment (parallel zu boundaries)
  let rMaxAll = R0;
  let theta = -Math.PI / 2;

  for (const area of areas) {
    const items = byArea.get(area)!;
    boundaries.push(theta);
    const a0 = theta + SEG_GAP / 2;
    const a1 = theta + SEG_ANGLE - SEG_GAP / 2;
    const span = Math.max(0.001, a1 - a0);
    const color = colors.get(area)!;

    const pos: { x: number; y: number }[] = [];
    let placed = 0;
    let r = R0;
    while (placed < items.length) {
      const perRow = Math.max(1, Math.floor((r * span) / NODE_GAP));
      const n = Math.min(perRow, items.length - placed);
      for (let j = 0; j < n; j++) {
        const t = n === 1 ? (a0 + a1) / 2 : a0 + (span * (j + 0.5)) / n;
        pos.push({ x: Math.cos(t) * r, y: Math.sin(t) * r });
      }
      placed += n;
      r += ROW;
    }
    segRmax.push(r);
    rMaxAll = Math.max(rMaxAll, r);

    items.forEach((it, i) => elements.push({
      data: { id: it.id, label: it.label, area, color, deg: it.in_degree },
      classes: "note", position: pos[i], grabbable: false,
    }));

    const mid = (a0 + a1) / 2;
    const lr = r + 16;
    elements.push({
      data: { id: `area::${area}`, label: area, color },
      classes: "arealabel",
      position: { x: Math.cos(mid) * lr, y: Math.sin(mid) * lr },
      grabbable: false, selectable: false,
    });

    theta += SEG_ANGLE;
  }

  // --- Äußere System-Ringe (Skills → Commands → MCPs) ---------------------
  const RING_GAP = 54;
  const sysRadii: { key: string; color: string; r: number }[] = [];
  let ringR = rMaxAll + 54;
  for (const sr of SYS_RINGS) {
    const items = system.segments[sr.key] ?? [];
    if (items.length === 0) continue;
    sysRadii.push({ key: sr.key, color: sr.color, r: ringR });

    const step = TAU / items.length;
    items.forEach((item, i) => {
      const a = -Math.PI / 2 + step / 2 + i * step;
      elements.push({
        data: {
          id: item.id, label: item.label, segment: sr.key, color: sr.color,
          beschreibung: item.meta?.beschreibung ?? "", pfad: item.meta?.pfad ?? "",
        },
        classes: "sysitem",
        position: { x: Math.cos(a) * ringR, y: Math.sin(a) * ringR }, grabbable: false,
      });
    });

    elements.push({
      data: { id: `sysseg::${sr.key}`, label: `${sr.title} · ${items.length}`, color: sr.color },
      classes: "seglabel",
      position: { x: 0, y: -(ringR + 22) }, grabbable: false, selectable: false,
    });
    ringR += RING_GAP;
  }

  const cy = cytoscape({
    container,
    elements,
    layout: { name: "preset" },
    minZoom: 0.08, maxZoom: 3,
    style: [
      { selector: "node.note", style: {
          "background-color": "data(color)",
          width: "mapData(deg, 0, 25, 5, 15)", height: "mapData(deg, 0, 25, 5, 15)",
          "border-width": 0, label: "", "z-index": 10,
      }},
      { selector: "node.sysitem", style: {
          "background-color": "data(color)", width: 13, height: 13,
          "border-width": 0, label: "", "z-index": 12,
      }},
      { selector: "node.note.lbl, node.note:selected, node.sysitem.lbl, node.sysitem:selected", style: {
          label: "data(label)", "font-size": 12, color: "#e6e6e6",
          "text-background-color": "#0e1116", "text-background-opacity": 0.8,
          "text-background-padding": "3px", "text-margin-y": -4,
          "border-width": 2, "border-color": "#fff", "z-index": 60,
      }},
      { selector: "node.arealabel", style: {
          label: "data(label)", "font-size": 15, "font-weight": "bold",
          color: "data(color)", "background-opacity": 0, "text-valign": "center",
          "text-background-color": "#0e1116", "text-background-opacity": 0.65,
          "text-background-padding": "4px", "z-index": 5,
      }},
      { selector: "node.seglabel", style: {
          label: "data(label)", "font-size": 16, "font-weight": "bold",
          color: "data(color)", "background-opacity": 0, "text-valign": "center",
          "text-background-color": "#0e1116", "text-background-opacity": 0.7,
          "text-background-padding": "4px", "z-index": 6,
      }},
      { selector: "node.hub", style: {
          label: "data(label)", "font-size": 20, "font-weight": "bold",
          color: "#fff", "background-color": "#e6e6e6", "background-opacity": 0.1,
          width: 60, height: 60, "border-width": 2, "border-color": "#3a4150",
          "text-valign": "center", "z-index": 20,
      }},
      { selector: "node.dim", style: { opacity: 0.15 } },
    ],
    wheelSensitivity: 0.2,
  });

  // Guides: begrenzte Kuchen-Trennlinien + Kreise für die äußeren System-Ringe.
  const ctx = guideCanvas.getContext("2d")!;
  let dpr = window.devicePixelRatio || 1;
  function resize() {
    const rect = guideCanvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    guideCanvas.width = Math.round(rect.width * dpr);
    guideCanvas.height = Math.round(rect.height * dpr);
    scheduleDraw();
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
    if (container.style.display === "none") return;
    const hub = cy.getElementById("pie::hub");
    if (hub.empty()) return;
    const c = hub.renderedPosition();
    const z = cy.zoom();
    // Kuchen-Trennlinien nur bis zur Länge der angrenzenden Segmente.
    ctx.strokeStyle = "#3a4150";
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    const n = boundaries.length;
    for (let i = 0; i < n; i++) {
      const b = boundaries[i];
      const prev = (i - 1 + n) % n;
      const rlen = Math.max(segRmax[prev], segRmax[i]) + 6;
      ctx.beginPath();
      ctx.moveTo(c.x + Math.cos(b) * R0 * 0.7 * z, c.y + Math.sin(b) * R0 * 0.7 * z);
      ctx.lineTo(c.x + Math.cos(b) * rlen * z, c.y + Math.sin(b) * rlen * z);
      ctx.stroke();
    }
    // Guide-Kreise für die System-Ringe.
    for (const sr of sysRadii) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, sr.r * z, 0, TAU);
      ctx.strokeStyle = sr.color;
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  let pending = false;
  function scheduleDraw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; draw(); });
  }
  cy.on("render pan zoom", scheduleDraw);
  window.addEventListener("resize", resize);

  // Labels zoom-kompensiert (konstante Bildschirmgröße).
  function applyLabelZoom() {
    const z = cy.zoom();
    cy.nodes(".note, .sysitem").style("font-size", Math.max(6, Math.min(90, 13 / z)));
    cy.nodes(".arealabel").style("font-size", Math.max(7, Math.min(110, 15 / z)));
    cy.nodes(".seglabel").style("font-size", Math.max(7, Math.min(120, 16 / z)));
  }
  cy.on("zoom", applyLabelZoom);

  cy.on("mouseover", "node.note, node.sysitem", (e) => e.target.addClass("lbl"));
  cy.on("mouseout", "node.note, node.sysitem", (e) => e.target.removeClass("lbl"));

  let nodeCb: ((id: string) => void) | null = null;
  let sysCb: ((item: SystemItem) => void) | null = null;
  cy.on("tap", "node.note", (e) => {
    cy.nodes(".note, .sysitem").addClass("dim");
    e.target.removeClass("dim");
    nodeCb?.(e.target.id());
  });
  cy.on("tap", "node.sysitem", (e) => {
    const d = e.target.data();
    cy.nodes(".note, .sysitem").addClass("dim");
    e.target.removeClass("dim");
    sysCb?.({ id: d.id, label: d.label, segment: d.segment,
              meta: { beschreibung: d.beschreibung, pfad: d.pfad } });
  });
  cy.on("tap", (e) => { if (e.target === cy) clearSelection(); });

  function clearSelection() {
    cy.nodes(".note, .sysitem").removeClass("dim");
    cy.$(":selected").unselect();
  }

  // Zentriert + markiert einen Eintrag (wie ein Klick) — für die Suche.
  function focus(id: string): boolean {
    const n = cy.getElementById(id);
    if (n.empty()) return false;
    cy.$(":selected").unselect();
    cy.nodes(".note, .sysitem").addClass("dim");
    n.removeClass("dim").select();
    cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 1.2) }, { duration: 350 });
    return true;
  }

  let laidOut = false;
  return {
    cy,
    show() {
      container.style.display = "";
      guideCanvas.style.display = "";
      cy.resize();
      resize();
      if (!laidOut) { cy.fit(undefined, 80); laidOut = true; }
      applyLabelZoom();
      scheduleDraw();
    },
    hide() {
      container.style.display = "none";
      guideCanvas.style.display = "none";
    },
    onNodeClick(cb) { nodeCb = cb; },
    onSystemClick(cb) { sysCb = cb; },
    focus,
    clearSelection,
  };
}
