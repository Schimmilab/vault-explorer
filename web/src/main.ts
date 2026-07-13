// web/src/main.ts
import { getGraph } from "./api";
import { initGraph } from "./graph";

async function boot() {
  const data = await getGraph();
  const container = document.getElementById("cy")!;
  const graph = initGraph(container, data);

  graph.onNodeClick((id, isArea) => {
    if (isArea) graph.expandArea(id.replace(/^area:/, ""));
    else (window as any).__inspect?.(id); // Inspektor kommt in Task 17
  });
  // Doppelklick auf leere Fläche → zurück zur Bereichsebene
  graph.cy.on("dbltap", (e) => { if (e.target === graph.cy) graph.collapseToAreas(); });

  (window as any).__graph = graph; // für spätere Tasks
  (window as any).__data = data;
}
boot().catch((e) => console.error(e));
