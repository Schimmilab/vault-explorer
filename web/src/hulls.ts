// web/src/hulls.ts
// Zeichnet je Cluster eine weiche "Wolke" (konvexe Hülle der Knoten, aufgebläht + geglättet)
// auf einer Canvas-Ebene HINTER den Knoten — statt der nüchternen Compound-Rechtecke.
import type { Core } from "cytoscape";

/** Konvexe Hülle (Andrew's monotone chain). Gibt die Punkte im Uhrzeigersinn-Ring zurück. */
function convexHull(pts: number[][]): number[][] {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: number[][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

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
    ctx.lineJoin = "round";

    cy.nodes(".area").forEach((area: any) => {
      if (area.style("display") === "none") return;
      const kids = area.children().filter((k: any) => k.style("display") !== "none");
      if (kids.length === 0) return;

      const pts: number[][] = [];
      let maxR = 0;
      kids.forEach((k: any) => {
        const p = k.renderedPosition();
        pts.push([p.x, p.y]);
        maxR = Math.max(maxR, k.renderedWidth() / 2);
      });
      const pad = maxR + 15;
      const color = area.data("color") as string;
      const sel = area.hasClass("sel");

      let cx = 0;
      let cyy = 0;
      pts.forEach((p) => {
        cx += p[0];
        cyy += p[1];
      });
      cx /= pts.length;
      cyy /= pts.length;

      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = sel ? 2.5 : 1.4;

      const hull = convexHull(pts);
      if (hull.length < 3) {
        // 1–2 Knoten → Kreis um den/die Punkte
        let r = pad;
        pts.forEach((p) => {
          r = Math.max(r, Math.hypot(p[0] - cx, p[1] - cyy) + pad);
        });
        ctx.beginPath();
        ctx.arc(cx, cyy, r, 0, Math.PI * 2);
      } else {
        // radial vom Zentroid aufblähen → Wolke umschließt die Knoten mit Rand
        const P = hull.map((p) => {
          const dx = p[0] - cx;
          const dy = p[1] - cyy;
          const d = Math.hypot(dx, dy) || 1;
          return [p[0] + (dx / d) * pad, p[1] + (dy / d) * pad];
        });
        // weiche geschlossene Kurve durch die Kantenmittelpunkte (Hüllpunkte als Kontrollpunkte)
        const n = P.length;
        ctx.beginPath();
        ctx.moveTo((P[0][0] + P[n - 1][0]) / 2, (P[0][1] + P[n - 1][1]) / 2);
        for (let i = 0; i < n; i++) {
          const cur = P[i];
          const next = P[(i + 1) % n];
          ctx.quadraticCurveTo(cur[0], cur[1], (cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2);
        }
        ctx.closePath();
      }
      ctx.globalAlpha = sel ? 0.16 : 0.1;
      ctx.fill();
      ctx.globalAlpha = sel ? 0.95 : 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  // draw an alle Zustands-Events binden, aber pro Frame nur einmal ausführen (rAF-Coalescing),
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
