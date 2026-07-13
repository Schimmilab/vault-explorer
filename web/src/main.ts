// web/src/main.ts
import { getGraph } from "./api";
import { initGraph } from "./graph";
import { initInspector } from "./inspector";
import { initSearch } from "./search";

async function boot() {
  const data = await getGraph();
  const container = document.getElementById("cy")!;
  const graph = initGraph(container, data);

  graph.onNodeClick((id, isArea) => {
    if (isArea) graph.expandArea(id.replace(/^area:/, ""));
    else (window as any).__inspect?.(id);
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

  await initSearch(
    document.getElementById("search") as HTMLInputElement,
    (id) => {
      const node = data.nodes.find((n) => n.id === id);
      if (!node) return;
      graph.expandArea(node.area);
      graph.flyTo(id);
      inspect(id);
    },
  );

  (window as any).__graph = graph; // für spätere Tasks
  (window as any).__data = data;
}
boot().catch((e) => console.error(e));
