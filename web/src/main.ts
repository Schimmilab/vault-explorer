// web/src/main.ts
import { getGraph } from "./api";
import { initGraph } from "./graph";
import { initInspector } from "./inspector";

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

  const inspectorEl = document.getElementById("inspector")!;
  const inspect = initInspector(inspectorEl, data, (targetId) => {
    graph.expandArea(data.nodes.find((n) => n.id === targetId)!.area);
    graph.flyTo(targetId);
    inspect(targetId);
  });
  (window as any).__inspect = inspect;

  (window as any).__graph = graph; // für spätere Tasks
  (window as any).__data = data;
}
boot().catch((e) => console.error(e));
