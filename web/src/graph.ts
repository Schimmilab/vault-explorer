// web/src/graph.ts
import cytoscape, { Core, ElementDefinition } from "cytoscape";
import fcose from "cytoscape-fcose";
import type { GraphData } from "./api";

cytoscape.use(fcose);

export interface GraphController {
  cy: Core;
  onNodeClick: (cb: (id: string, isArea: boolean) => void) => void;
  flyTo: (id: string) => void;
  expandArea: (area: string) => void;
  collapseToAreas: () => void;
}

/** Aggregiert Datei-Knoten zu einem Knoten je Bereich (Zoom-Ebene 0). */
function areaElements(data: GraphData): ElementDefinition[] {
  const counts = new Map<string, number>();
  for (const n of data.nodes) counts.set(n.area, (counts.get(n.area) ?? 0) + 1);
  return [...counts].map(([area, count]) => ({
    data: { id: `area:${area}`, label: area, kind: "area", count },
  }));
}

export function initGraph(container: HTMLElement, data: GraphData): GraphController {
  const cy = cytoscape({
    container,
    elements: areaElements(data),
    style: [
      { selector: 'node[kind="area"]', style: {
        label: "data(label)", color: "#e6e6e6", "font-size": 11,
        "text-valign": "center", "text-halign": "center",
        width: "mapData(count, 1, 200, 30, 120)",
        height: "mapData(count, 1, 200, 30, 120)",
        "background-color": "#2b3a55", "border-color": "#6ea8fe", "border-width": 2,
      } },
      { selector: "edge", style: {
        "line-color": "#2a2f3a", width: 1, "curve-style": "straight",
        opacity: 0.15, "target-arrow-shape": "none",
      } },
      { selector: ".dim", style: { opacity: 0.08 } },
      { selector: ".hi", style: { opacity: 1, "line-color": "#6ea8fe", "border-color": "#6ea8fe" } },
    ],
    layout: { name: "fcose", animate: true, idealEdgeLength: 120 } as any,
    wheelSensitivity: 0.2,
  });

  /** Datei-Knoten + interne Kanten eines Bereichs (Zoom-Ebene 1). */
  function fileElements(area: string): ElementDefinition[] {
    const nodes = data.nodes.filter((n) => n.area === area);
    const ids = new Set(nodes.map((n) => n.id));
    const els: ElementDefinition[] = nodes.map((n) => ({
      data: { id: n.id, label: n.label, kind: "note", area: n.area, size: n.size },
    }));
    for (const e of data.edges) {
      if (ids.has(e.source) && ids.has(e.target)) {
        els.push({ data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target } });
      }
    }
    return els;
  }

  const controller: GraphController = {
    cy,
    onNodeClick: (cb) => cy.on("tap", "node", (e) => {
      const d = e.target.data();
      cb(d.id, d.kind === "area");
    }),
    flyTo: (id) => {
      const el = cy.getElementById(id);
      if (el.length) cy.animate({ center: { eles: el }, zoom: 1.5 }, { duration: 400 });
    },
    expandArea: (area: string) => {
      cy.elements().remove();
      cy.add(fileElements(area));
      cy.style().selector('node[kind="note"]').style({
        label: "data(label)", "font-size": 8, color: "#cbd3e1",
        "background-color": "#3a4a6b", "border-color": "#6ea8fe", "border-width": 1,
        width: "mapData(size, 0, 30, 12, 46)", height: "mapData(size, 0, 30, 12, 46)",
      }).update();
      cy.layout({ name: "fcose", animate: true, idealEdgeLength: 60 } as any).run();
    },
    collapseToAreas: () => {
      cy.elements().remove();
      cy.add(areaElements(data));
      cy.layout({ name: "fcose", animate: true, idealEdgeLength: 120 } as any).run();
    },
  };
  return controller;
}
