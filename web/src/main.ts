// web/src/main.ts
import { getGraph } from "./api";
import { initGraph } from "./graph";
import { initInspector } from "./inspector";
import { initSearch } from "./search";

async function boot() {
  const data = await getGraph();
  const container = document.getElementById("cy")!;
  const graph = initGraph(container, data);

  const inspectorEl = document.getElementById("inspector")!;
  const inspect = initInspector(inspectorEl, data, (targetId) => {
    graph.focus(targetId);
    graph.flyTo(targetId);
    inspect(targetId);
  });
  (window as any).__inspect = inspect;

  // Klick auf einen Knoten → Nachbarschaft hervorheben + Inspektor öffnen.
  graph.onNodeClick((id) => {
    graph.focus(id);
    inspect(id);
  });
  // Klick auf leere Fläche → Fokus lösen + Inspektor schließen.
  graph.cy.on("tap", (e) => {
    if (e.target === graph.cy) {
      graph.clearFocus();
      inspectorEl.classList.add("hidden");
    }
  });

  await initSearch(document.getElementById("search") as HTMLInputElement, (id) => {
    graph.focus(id);
    graph.flyTo(id);
    inspect(id);
  });

  (window as any).__graph = graph;
  (window as any).__data = data;
}
boot().catch((e) => console.error(e));
