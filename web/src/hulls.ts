// web/src/hulls.ts
// Zeichnet je Cluster eine weiche "Wolke" HINTER den Knoten. Ansatz: Kreis-Union
// (Metaball-artig) — um jeden Knoten eine runde Aura, die zu einer organischen Form
// verschmilzt. Folgt den Knoten (konkav), wird nie spitz (im Gegensatz zur konvexen Hülle).
import type { Core } from "cytoscape";

const TAU = Math.PI * 2;

export function initHulls(cy: Core): void {
  const canvas = document.getElementById("hulls") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  let dpr = window.devicePixelRatio || 1;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }
  resize();
  window.addEventListener("resize", resize);
  cy.on("resize", resize);

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    cy.nodes(".area").forEach((area: any) => {
      if (area.style("display") === "none") return;
      const kids = area.children().filter((k: any) => k.style("display") !== "none");
      if (kids.length === 0) return;

      const color = area.data("color") as string;
      const sel = area.hasClass("sel");
      const pts = kids.map((k: any) => {
        const p = k.renderedPosition();
        return { x: p.x, y: p.y, r: k.renderedWidth() / 2 };
      });

      // Kreis-Union als ein Pfad → verschmilzt nahe Knoten zu einer weichen Wolke.
      const ring = (extra: number) => {
        ctx.beginPath();
        for (const p of pts) {
          const r = p.r + extra;
          ctx.moveTo(p.x + r, p.y);
          ctx.arc(p.x, p.y, r, 0, TAU);
        }
      };

      ctx.fillStyle = color;
      // äußere, blassere Schicht → weicher Wolkenrand
      ring(24);
      ctx.globalAlpha = sel ? 0.26 : 0.15;
      ctx.fill();
      // innere, kräftigere Schicht → definierter Kern
      ring(12);
      ctx.globalAlpha = sel ? 0.2 : 0.12;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  // draw an alle Zustands-Events binden, aber pro Frame nur einmal (rAF-Coalescing),
  // damit die 494 position-Events beim Layout nicht 494 Zeichnungen auslösen.
  let pending = false;
  function scheduleDraw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      draw();
    });
  }
  cy.on("render pan zoom drag free position layoutstop", scheduleDraw);
  scheduleDraw();
}
