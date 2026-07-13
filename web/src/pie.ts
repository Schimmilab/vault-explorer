// web/src/pie.ts
// Dritter View-Modus: "Kuchen". Zeigt denselben Vault-Inhalt wie der Graph, aber
// als Kuchendiagramm: jeder Bereich (Top-Ordner) ist ein Tortenstück, der Winkel
// proportional zur Notizenzahl, die Notizen radial von innen nach außen gepackt.
// Knotengröße ~ Eingangsgrad (wichtige Notizen größer). Eigene Cytoscape-Instanz.
import cytoscape, { Core } from "cytoscape";
import type { GraphData, GraphNode } from "./api";

const TAU = Math.PI * 2;

/** Daily Logs (05-daily) raus — wie im Graph, verwässern nur die Struktur. */
const isDaily = (id: string, area: string) =>
  area === "05-daily" || id.startsWith("05-daily/");

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
  clearSelection: () => void;
}

export function initPie(
  container: HTMLElement,
  guideCanvas: HTMLCanvasElement,
  data: GraphData,
): PieController {
  // Notizen nach Bereich gruppieren (Daily raus).
  const byArea = new Map<string, GraphNode[]>();
  let count = 0;
  for (const n of data.nodes) {
    if (isDaily(n.id, n.area)) continue;
    const arr = byArea.get(n.area);
    if (arr) arr.push(n); else byArea.set(n.area, [n]);
    count++;
  }
  const areas = [...byArea.keys()].sort();
  const colors = areaColors(areas);
  const total = count || 1;

  const R0 = 70;        // innerer Radius um die Nabe
  const NODE_GAP = 16;  // Ziel-Abstand benachbarter Knoten (Modell-px)
  const ROW = 16;       // radialer Reihenabstand
  const SEG_GAP = 0.05; // Winkel-Lücke zwischen zwei Stücken (rad)

  const elements: cytoscape.ElementDefinition[] = [{
    data: { id: "pie::hub", label: "Vault" }, classes: "hub",
    position: { x: 0, y: 0 }, grabbable: false, selectable: false,
  }];

  const boundaries: number[] = [];
  let rMaxAll = R0;
  let theta = -Math.PI / 2;

  for (const area of areas) {
    const items = byArea.get(area)!;
    const dth = (TAU * items.length) / total;
    boundaries.push(theta);
    const a0 = theta + SEG_GAP / 2;
    const a1 = theta + dth - SEG_GAP / 2;
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

    theta += dth;
  }

  const cy = cytoscape({
    container,
    elements,
    layout: { name: "preset" },
    minZoom: 0.1, maxZoom: 3,
    style: [
      { selector: "node.note", style: {
          "background-color": "data(color)",
          width: "mapData(deg, 0, 25, 5, 15)", height: "mapData(deg, 0, 25, 5, 15)",
          "border-width": 0, label: "", "z-index": 10,
      }},
      { selector: "node.note.lbl, node.note:selected", style: {
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

  // Radiale Trennlinien zwischen den Stücken (dezent), folgt Pan/Zoom.
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
    ctx.strokeStyle = "#3a4150";
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    for (const b of boundaries) {
      ctx.beginPath();
      ctx.moveTo(c.x + Math.cos(b) * R0 * 0.7 * z, c.y + Math.sin(b) * R0 * 0.7 * z);
      ctx.lineTo(c.x + Math.cos(b) * (rMaxAll + 8) * z, c.y + Math.sin(b) * (rMaxAll + 8) * z);
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
  const NOTE_LABEL_PX = 13;
  const AREA_LABEL_PX = 15;
  function applyLabelZoom() {
    const z = cy.zoom();
    cy.nodes(".note").style("font-size", Math.max(6, Math.min(90, NOTE_LABEL_PX / z)));
    cy.nodes(".arealabel").style("font-size", Math.max(7, Math.min(110, AREA_LABEL_PX / z)));
  }
  cy.on("zoom", applyLabelZoom);

  cy.on("mouseover", "node.note", (e) => e.target.addClass("lbl"));
  cy.on("mouseout", "node.note", (e) => e.target.removeClass("lbl"));

  let nodeCb: ((id: string) => void) | null = null;
  cy.on("tap", "node.note", (e) => {
    cy.nodes(".note").addClass("dim");
    e.target.removeClass("dim");
    nodeCb?.(e.target.id());
  });
  cy.on("tap", (e) => { if (e.target === cy) clearSelection(); });

  function clearSelection() { cy.nodes(".note").removeClass("dim"); }

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
    clearSelection,
  };
}
