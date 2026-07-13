// web/src/main.ts
import { getGraph } from "./api";
import { initGraph } from "./graph";
import { initHulls } from "./hulls";
import { initInspector } from "./inspector";
import { initSearch } from "./search";

async function boot() {
  const data = await getGraph();
  const container = document.getElementById("cy")!;
  const graph = initGraph(container, data);
  initHulls(graph.cy); // zeichnet die Cluster-Wolken hinter den Knoten

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

  // Controls auf den gespeicherten Zustand setzen (Anordnung wurde aus localStorage geladen).
  const depthSel = document.getElementById("cluster-depth") as HTMLSelectElement;
  depthSel.value = String(graph.initial.depth);
  depthSel.addEventListener("change", () => graph.setClusterDepth(parseInt(depthSel.value, 10)));

  // Isolierte Notizen (Orphans) ein-/ausblenden.
  const orphanToggle = document.getElementById("toggle-orphans") as HTMLInputElement;
  orphanToggle.checked = graph.initial.orphansShown;
  orphanToggle.addEventListener("change", () => graph.showOrphans(orphanToggle.checked));

  // Kompaktheit: Regler wirkt auf das angeklickte Cluster, sonst auf alle.
  const compaction = document.getElementById("compaction") as HTMLInputElement;
  const scope = document.getElementById("compact-scope") as HTMLSpanElement;
  compaction.value = String(graph.initial.compaction);
  compaction.addEventListener("input", () => graph.setCompaction(parseInt(compaction.value, 10)));
  graph.onSelectionChange((name, value) => {
    compaction.value = String(value);
    scope.textContent = name ?? "alle";
  });

  // Neu anordnen: gespeicherte Anordnung der aktuellen Ebene verwerfen und frisch layouten.
  const relayoutBtn = document.getElementById("relayout") as HTMLButtonElement;
  relayoutBtn.addEventListener("click", () => graph.relayout());

  await initSearch(document.getElementById("search") as HTMLInputElement, (id) => {
    graph.focus(id);
    graph.flyTo(id);
    inspect(id);
  });

  (window as any).__graph = graph;
  (window as any).__data = data;
}
boot().catch((e) => console.error(e));
