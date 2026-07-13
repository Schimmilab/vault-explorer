// web/src/minimap.ts
// Kleine Übersichtskarte unten links — funktioniert für jeden View (Graph/Ring).
// Zeichnet alle sichtbaren Knoten als Punkte + das aktuelle Sichtfeld als Rahmen.
// Bleibt beim Zoom konstant groß (fixes Overlay); Klick schwenkt dorthin.
import type { Core } from "cytoscape";

export interface Minimap {
  setCy: (cy: Core | null) => void;
}

export function initMinimap(canvas: HTMLCanvasElement): Minimap {
  const ctx = canvas.getContext("2d")!;
  let cy: Core | null = null;
  let off: (() => void) | null = null;
  let pending = false;

  const cssW = () => canvas.getBoundingClientRect().width;
  const cssH = () => canvas.getBoundingClientRect().height;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW() * dpr);
    canvas.height = Math.round(cssH() * dpr);
    schedule();
  }

  // Modell→Minimap-Transform (aspect-fit der sichtbaren Knoten-Bounding-Box).
  function transform() {
    const vis = cy!.nodes(":visible");
    if (vis.empty()) return null;
    const bb = vis.boundingBox();
    const pad = 8;
    const w = cssW(), h = cssH();
    const scale = Math.min((w - 2 * pad) / (bb.w || 1), (h - 2 * pad) / (bb.h || 1));
    const ox = (w - bb.w * scale) / 2 - bb.x1 * scale;
    const oy = (h - bb.h * scale) / 2 - bb.y1 * scale;
    return { scale, ox, oy };
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!cy) return;
    const t = transform();
    if (!t) return;
    const tx = (x: number) => x * t.scale + t.ox;
    const ty = (y: number) => y * t.scale + t.oy;

    cy.nodes(":visible").forEach((n: any) => {
      if (n.isParent()) return; // Cluster-Hüllen nicht als Punkt zeichnen
      const p = n.position();
      ctx.fillStyle = (n.data("color") as string) || "#8a94a6";
      ctx.fillRect(tx(p.x) - 1, ty(p.y) - 1, 2, 2);
    });

    // aktuelles Sichtfeld
    const e = cy.extent();
    ctx.strokeStyle = "#e6e6e6";
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx(e.x1), ty(e.y1), (e.x2 - e.x1) * t.scale, (e.y2 - e.y1) * t.scale);
    ctx.globalAlpha = 1;
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; draw(); });
  }

  // Klick auf die Minimap → dorthin schwenken (Modellpunkt in die Viewport-Mitte).
  canvas.addEventListener("mousedown", (ev) => {
    if (!cy) return;
    const t = transform();
    if (!t) return;
    const r = canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const modelX = (mx - t.ox) / t.scale, modelY = (my - t.oy) / t.scale;
    const z = cy.zoom();
    cy.pan({ x: cy.width() / 2 - modelX * z, y: cy.height() / 2 - modelY * z });
  });

  window.addEventListener("resize", resize);
  resize();

  return {
    setCy(next) {
      if (off) { off(); off = null; }
      cy = next;
      if (cy) {
        const h = () => schedule();
        cy.on("render pan zoom", h);
        off = () => cy && cy.off("render pan zoom", h);
        resize();
      } else {
        schedule();
      }
    },
  };
}
