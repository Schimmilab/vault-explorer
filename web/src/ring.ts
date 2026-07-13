// web/src/ring.ts
// Zweiter View-Modus: das "System-Rad". Zeigt das operative System um den Vault
// — Skills, Commands, Memory, MCPs, Routines — als Kuchendiagramm: jeder Bereich
// ist ein Tortenstück (Winkel proportional zur Eintragszahl), die Einträge sind
// radial von innen nach außen im Stück gepackt. Eigene Cytoscape-Instanz mit fest
// berechneten Positionen (preset). Dezente radiale Trennlinien auf einem Canvas.
import cytoscape, { Core } from "cytoscape";
import type { SystemData, SystemItem } from "./api";

/** Segment-Reihenfolge (im Uhrzeigersinn ab oben) + Farbe + Anzeigename. */
const SEGMENTS: { key: string; color: string; title: string }[] = [
  { key: "skills", color: "#6ea8fe", title: "Skills" },
  { key: "commands", color: "#7ee787", title: "Commands" },
  { key: "memory", color: "#f0a35e", title: "Memory" },
  { key: "mcps", color: "#d2a8ff", title: "MCPs" },
  { key: "routines", color: "#f778ba", title: "Routines" },
];

const TAU = Math.PI * 2;

export interface RingController {
  cy: Core;
  show: () => void;
  hide: () => void;
  onItemClick: (cb: (item: SystemItem) => void) => void;
  clearSelection: () => void;
}

export function initRing(
  container: HTMLElement,
  guideCanvas: HTMLCanvasElement,
  data: SystemData,
): RingController {
  // --- Kuchen-Layout berechnen -------------------------------------------
  const active = SEGMENTS.filter((s) => (data.counts[s.key] ?? 0) > 0);
  const total = active.reduce((a, s) => a + (data.counts[s.key] ?? 0), 0) || 1;
  const R0 = 74;        // innerer Radius um die Nabe
  const NODE_GAP = 24;  // Ziel-Abstand benachbarter Knoten (Modell-px)
  const ROW = 24;       // radialer Reihenabstand
  const SEG_GAP = 0.06; // Winkel-Lücke zwischen zwei Stücken (rad)

  const elements: cytoscape.ElementDefinition[] = [{
    data: { id: "sys::hub", label: "KI-OS" }, classes: "hub",
    position: { x: 0, y: 0 }, grabbable: false, selectable: false,
  }];

  const boundaries: number[] = []; // Trennlinien-Winkel zwischen den Stücken
  let rMaxAll = R0;
  let theta = -Math.PI / 2;         // Start oben (12 Uhr)

  for (const seg of active) {
    const items = data.segments[seg.key] ?? [];
    const dth = (TAU * items.length) / total;
    boundaries.push(theta);
    const a0 = theta + SEG_GAP / 2;
    const a1 = theta + dth - SEG_GAP / 2;
    const span = Math.max(0.001, a1 - a0);

    // Einträge in radiale Reihen packen: pro Reihe passt floor(bogenlänge/gap).
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

    items.forEach((item, i) => elements.push({
      data: {
        id: item.id, label: item.label, segment: seg.key, color: seg.color,
        beschreibung: item.meta?.beschreibung ?? "", pfad: item.meta?.pfad ?? "",
      },
      classes: "item",
      position: pos[i], grabbable: false,
    }));

    // Segment-Beschriftung außen in der Winkelmitte des Stücks.
    const mid = (a0 + a1) / 2;
    const lr = r + 18;
    elements.push({
      data: { id: `seg::${seg.key}`, label: `${seg.title} · ${items.length}`, color: seg.color },
      classes: "seglabel",
      position: { x: Math.cos(mid) * lr, y: Math.sin(mid) * lr },
      grabbable: false, selectable: false,
    });

    theta += dth;
  }

  const cy = cytoscape({
    container,
    elements,
    layout: { name: "preset" },
    minZoom: 0.15, maxZoom: 3,
    style: [
      { selector: "node.item", style: {
          "background-color": "data(color)", width: 13, height: 13,
          "border-width": 0, label: "", "z-index": 10,
      }},
      { selector: "node.item.lbl, node.item:selected", style: {
          label: "data(label)", "font-size": 12, color: "#e6e6e6",
          "text-background-color": "#0e1116", "text-background-opacity": 0.8,
          "text-background-padding": "3px", "text-margin-y": -4,
          width: 17, height: 17, "border-width": 2, "border-color": "#fff",
          "z-index": 60,
      }},
      { selector: "node.seglabel", style: {
          label: "data(label)", "font-size": 15, "font-weight": "bold",
          color: "data(color)", "background-opacity": 0, "text-valign": "center",
          "text-background-color": "#0e1116", "text-background-opacity": 0.65,
          "text-background-padding": "4px", "z-index": 5,
      }},
      { selector: "node.hub", style: {
          label: "data(label)", "font-size": 22, "font-weight": "bold",
          color: "#fff", "background-color": "#e6e6e6", "background-opacity": 0.1,
          width: 64, height: 64, "border-width": 2, "border-color": "#3a4150",
          "text-valign": "center", "z-index": 20,
      }},
      { selector: "node.dim", style: { opacity: 0.18 } },
    ],
    wheelSensitivity: 0.2,
  });

  // Radiale Trennlinien zwischen den Tortenstücken (dezent), folgt Pan/Zoom.
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
    const hub = cy.getElementById("sys::hub");
    if (hub.empty()) return;
    const c = hub.renderedPosition();
    const z = cy.zoom();
    ctx.strokeStyle = "#3a4150";
    ctx.globalAlpha = 0.5;
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

  // Labels zoom-kompensiert: Schriftgröße invers zum Zoom → nahezu konstante
  // Bildschirmgröße (rausgezoomt gut lesbar, reingezoomt nicht überdimensioniert).
  const ITEM_LABEL_PX = 13;
  const SEG_LABEL_PX = 15;
  function applyLabelZoom() {
    const z = cy.zoom();
    cy.nodes(".item").style("font-size", Math.max(6, Math.min(90, ITEM_LABEL_PX / z)));
    cy.nodes(".seglabel").style("font-size", Math.max(7, Math.min(110, SEG_LABEL_PX / z)));
  }
  cy.on("zoom", applyLabelZoom);

  // Hover → Label des Knotens einblenden.
  cy.on("mouseover", "node.item", (e) => e.target.addClass("lbl"));
  cy.on("mouseout", "node.item", (e) => e.target.removeClass("lbl"));

  let itemCb: ((item: SystemItem) => void) | null = null;
  cy.on("tap", "node.item", (e) => {
    const d = e.target.data();
    cy.nodes(".item").addClass("dim");
    e.target.removeClass("dim");
    itemCb?.({ id: d.id, label: d.label, segment: d.segment,
               meta: { beschreibung: d.beschreibung, pfad: d.pfad } });
  });
  cy.on("tap", (e) => { if (e.target === cy) clearSelection(); });

  function clearSelection() { cy.nodes(".item").removeClass("dim"); }

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
    onItemClick(cb) { itemCb = cb; },
    clearSelection,
  };
}
