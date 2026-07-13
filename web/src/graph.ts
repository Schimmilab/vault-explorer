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
}

/** Distinkte Farbe je Bereich, gleichmäßig über den Farbkreis verteilt. */
function areaColors(data: GraphData): Map<string, string> {
  const areas = [...new Set(data.nodes.map((n) => n.area))].sort();
  const m = new Map<string, string>();
  areas.forEach((a, i) =>
    m.set(a, `hsl(${Math.round((i / Math.max(areas.length, 1)) * 360)}, 62%, 58%)`),
  );
  return m;
}

/** Alle Notizen als Knoten (farbig nach Bereich) + alle internen Links als Kanten. */
function allElements(data: GraphData, colors: Map<string, string>): ElementDefinition[] {
  const ids = new Set(data.nodes.map((n) => n.id));
  const els: ElementDefinition[] = data.nodes.map((n) => ({
    data: {
      id: n.id,
      label: n.label,
      area: n.area,
      size: n.size,
      color: colors.get(n.area) ?? "#6ea8fe",
    },
  }));
  for (const e of data.edges) {
    if (ids.has(e.source) && ids.has(e.target)) {
      els.push({ data: { id: `${e.source}=>${e.target}`, source: e.source, target: e.target } });
    }
  }
  return els;
}

export function initGraph(container: HTMLElement, data: GraphData): GraphController {
  const colors = areaColors(data);
  const cy = cytoscape({
    container,
    elements: allElements(data, colors),
    style: [
      {
        selector: "node",
        style: {
          "background-color": "data(color)",
          width: "mapData(size, 0, 40, 12, 48)",
          height: "mapData(size, 0, 40, 12, 48)",
          "border-width": 0,
          label: "", // standardmäßig aus → saubere Wolke; erscheint bei Hover/Fokus
          "font-size": 10,
          color: "#eef2f8",
          "text-outline-color": "#0e1116",
          "text-outline-width": 2,
          "text-valign": "center",
          "text-halign": "center",
        },
      },
      {
        selector: "edge",
        style: {
          "line-color": "#39404e",
          width: 1,
          opacity: 0.14,
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
          "z-index": 20,
        },
      },
      {
        selector: "edge.hl",
        style: { "line-color": "#9db4d8", width: 1.6, opacity: 0.9, "z-index": 15 },
      },
      { selector: "node.pin", style: { "border-width": 3, "border-color": "#ffffff" } },
    ],
    layout: {
      name: "fcose",
      animate: false,
      randomize: true,
      fit: true,
      padding: 50,
      quality: "default",
      nodeSeparation: 80,
      idealEdgeLength: 55,
      nodeRepulsion: 6000,
    } as any,
    wheelSensitivity: 0.2,
  });

  // Container ist beim Init oft noch ungemessen (0×0) → nach erstem Paint sauber einpassen.
  requestAnimationFrame(() => {
    cy.resize();
    cy.fit(undefined, 50);
  });

  let pinned: string | null = null;

  function highlight(node: NodeSingular) {
    const hood = node.closedNeighborhood(); // Knoten + verbundene Kanten + Nachbarknoten
    cy.elements().addClass("faded");
    hood.removeClass("faded").addClass("hl");
  }
  function clear() {
    cy.elements().removeClass("faded hl");
  }

  // Hover hebt die Nachbarschaft hervor (nur wenn nichts angepinnt ist).
  cy.on("mouseover", "node", (e) => {
    if (!pinned) highlight(e.target);
  });
  cy.on("mouseout", "node", () => {
    if (!pinned) clear();
  });

  const controller: GraphController = {
    cy,
    onNodeClick: (cb) => cy.on("tap", "node", (e) => cb(e.target.id())),
    flyTo: (id) => {
      const el = cy.getElementById(id);
      if (el.length) cy.animate({ center: { eles: el }, zoom: 1.4 }, { duration: 400 });
    },
    // Persistentes Obsidian-Highlight: Knoten + Verbundene bleiben markiert, Rest gedimmt.
    focus: (id) => {
      const node = cy.getElementById(id);
      if (!node.length) return;
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
  };
  return controller;
}
