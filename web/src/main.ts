// web/src/main.ts
import { getGraph } from "./api";
import { initGraph } from "./graph";

async function boot() {
  const data = await getGraph();
  const container = document.getElementById("cy")!;
  const graph = initGraph(container, data);
  graph.onNodeClick((id, isArea) => console.log("click", id, "area?", isArea));
  (window as any).__graph = graph; // für spätere Tasks
  (window as any).__data = data;
}
boot().catch((e) => console.error(e));
