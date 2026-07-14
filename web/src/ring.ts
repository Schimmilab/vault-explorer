// web/src/ring.ts
// Zweiter View-Modus: der "System-Ring". Zeigt das operative System um den Vault
// herum — Skills, Commands, Memory, MCPs, Routines — als konzentrische Ringe um
// eine zentrale Nabe ("KI-OS"). Eigene Cytoscape-Instanz mit fest berechneten
// Positionen (preset), damit jeder Ring sauber kreisförmig sitzt. Faint Guide-
// Kreise auf einem Canvas dahinter machen auch dünn besetzte Ringe als Ring lesbar.
import cytoscape, { Core } from "cytoscape";
import { installWheelZoom } from "./wheelzoom";
import type { SystemData, SystemItem } from "./api";

/** Segment-Reihenfolge von innen nach außen + Farbe + Anzeigename. */
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
  /** Einen System-Eintrag zentrieren + markieren. false, wenn nicht vorhanden. */
  focus: (id: string) => boolean;
  clearSelection: () => void;
}

/** Ringradien so wählen, dass Punkte mind. MIN_ARC auseinander liegen und
 *  zwischen zwei Ringen mind. MIN_GAP Platz ist. Gibt Radius je nicht-leerem
 *  Segment zurück (leere Segmente bekommen keinen Ring). */
function computeRadii(counts: Record<string, number>): Map<string, number> {
  const MIN_ARC = 24; // Pixelabstand benachbarter Punkte auf einem Ring
  const MIN_GAP = 96; // Abstand zwischen zwei Ringen
  const BASE = 150;
  const radii = new Map<string, number>();
  let base = BASE;
  for (const seg of SEGMENTS) {
    const n = counts[seg.key] ?? 0;
    if (n === 0) continue;
    const needed = (n * MIN_ARC) / TAU;
    const r = Math.max(base, needed);
    radii.set(seg.key, r);
    base = r + MIN_GAP;
  }
  return radii;
}

export function initRing(
  container: HTMLElement,
  guideCanvas: HTMLCanvasElement,
  data: SystemData,
): RingController {
  const radii = computeRadii(data.counts);
  const elements: cytoscape.ElementDefinition[] = [];

  // zentrale Nabe
  elements.push({
    data: { id: "sys::hub", label: "KI-OS" }, classes: "hub",
    position: { x: 0, y: 0 }, grabbable: false, selectable: false,
  });

  for (const seg of SEGMENTS) {
    const r = radii.get(seg.key);
    if (r === undefined) continue;
    const items = data.segments[seg.key] ?? [];

    // Segment-Beschriftung knapp außerhalb des Rings (in der Lücke zum nächsten),
    // damit sie nicht die obersten Punkte überlagert.
    elements.push({
      data: { id: `seg::${seg.key}`, label: `${seg.title} · ${items.length}`,
              color: seg.color },
      classes: "seglabel",
      position: { x: 0, y: -(r + 22) }, grabbable: false, selectable: false,
    });

    // Punkte gleichmäßig auf dem Ring; Startwinkel oben, damit sie das Label
    // nicht überlagern (halber Schritt versetzt).
    const step = TAU / Math.max(items.length, 1);
    items.forEach((item, i) => {
      const a = -Math.PI / 2 + step / 2 + i * step;
      elements.push({
        data: {
          id: item.id, label: item.label,
          segment: seg.key, color: seg.color,
          beschreibung: item.meta?.beschreibung ?? "",
          pfad: item.meta?.pfad ?? "",
        },
        classes: "item",
        position: { x: Math.cos(a) * r, y: Math.sin(a) * r },
        grabbable: false,
      });
    });
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
    // Wheel-/Pinch-Zoom übernimmt installWheelZoom (geräte-normalisiert: Trackpad + Maus).
    userZoomingEnabled: false,
  });

  installWheelZoom(cy);

  // Guide-Kreise: pro Ring ein blasser Kreis in Segmentfarbe, damit auch
  // dünn besetzte Ringe klar als Ring erkennbar sind. Folgt Pan/Zoom.
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
    for (const seg of SEGMENTS) {
      const r = radii.get(seg.key);
      if (r === undefined) continue;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * z, 0, TAU);
      ctx.strokeStyle = seg.color;
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

  function clearSelection() {
    cy.nodes(".item").removeClass("dim");
    cy.$(":selected").unselect();
  }

  // Zentriert + markiert einen System-Eintrag (wie ein Klick) — für die Suche.
  function focus(id: string): boolean {
    const n = cy.getElementById(id);
    if (n.empty()) return false;
    cy.$(":selected").unselect();
    cy.nodes(".item").addClass("dim");
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
      if (!laidOut) { cy.fit(undefined, 60); laidOut = true; }
      applyLabelZoom();
      scheduleDraw();
    },
    hide() {
      container.style.display = "none";
      guideCanvas.style.display = "none";
    },
    onItemClick(cb) { itemCb = cb; },
    focus,
    clearSelection,
  };
}
