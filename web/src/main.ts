// web/src/main.ts
import { getGraph, getSystem } from "./api";
import { initGraph } from "./graph";
import { initHulls } from "./hulls";
import { initInspector, renderSystemItem } from "./inspector";
import { initRing } from "./ring";
import { initPie } from "./pie";
import { initMinimap } from "./minimap";
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

  const searchEl = document.getElementById("search") as HTMLInputElement;
  await initSearch(searchEl, (id) => {
    graph.focus(id);
    graph.flyTo(id);
    inspect(id);
  });

  // System-Ring: zweiter Modus. Lazy — Daten erst beim ersten Wechsel holen.
  const ring = initRing(
    document.getElementById("ring")!,
    document.getElementById("ring-guides") as HTMLCanvasElement,
    await getSystem(),
  );
  ring.onItemClick((item) => renderSystemItem(inspectorEl, item));
  // Klick auf leere Ringfläche → Inspektor schließen (wie im Graph-Modus).
  ring.cy.on("tap", (e) => {
    if (e.target === ring.cy) inspectorEl.classList.add("hidden");
  });

  // Kuchen: dritter Modus. Gleicher Vault-Inhalt wie der Graph, als Kuchendiagramm.
  const pie = initPie(
    document.getElementById("pie")!,
    document.getElementById("pie-guides") as HTMLCanvasElement,
    data,
  );
  pie.onNodeClick((id) => inspect(id));
  pie.cy.on("tap", (e) => {
    if (e.target === pie.cy) inspectorEl.classList.add("hidden");
  });

  // Minimap: kleine Übersicht unten links, zeigt immer das aktive View.
  const minimap = initMinimap(document.getElementById("minimap") as HTMLCanvasElement);
  minimap.setCy(graph.cy);

  const modeGraphBtn = document.getElementById("mode-graph") as HTMLButtonElement;
  const modePieBtn = document.getElementById("mode-pie") as HTMLButtonElement;
  const modeRingBtn = document.getElementById("mode-ring") as HTMLButtonElement;
  const graphControls = document.getElementById("graph-controls")!;
  const cyEl = document.getElementById("cy")!;
  const hullsEl = document.getElementById("hulls")!;

  type Mode = "graph" | "pie" | "ring";
  function setMode(mode: Mode) {
    modeGraphBtn.classList.toggle("active", mode === "graph");
    modePieBtn.classList.toggle("active", mode === "pie");
    modeRingBtn.classList.toggle("active", mode === "ring");
    // nur der Graph-View braucht seine Controls + Suche
    graphControls.style.display = mode === "graph" ? "" : "none";
    searchEl.style.display = mode === "graph" ? "" : "none";
    cyEl.style.display = mode === "graph" ? "" : "none";
    hullsEl.style.display = mode === "graph" ? "" : "none";
    inspectorEl.classList.add("hidden");
    // Views ein-/ausblenden
    if (mode === "pie") { pie.show(); pie.clearSelection(); } else { pie.hide(); }
    if (mode === "ring") { ring.show(); ring.clearSelection(); } else { ring.hide(); }
    if (mode === "graph") graph.cy.resize();
    // Minimap folgt dem aktiven View
    minimap.setCy(mode === "pie" ? pie.cy : mode === "ring" ? ring.cy : graph.cy);
  }
  modeGraphBtn.addEventListener("click", () => setMode("graph"));
  modePieBtn.addEventListener("click", () => setMode("pie"));
  modeRingBtn.addEventListener("click", () => setMode("ring"));

  (window as any).__graph = graph;
  (window as any).__ring = ring;
  (window as any).__pie = pie;
  (window as any).__data = data;
}
boot().catch((e) => console.error(e));
