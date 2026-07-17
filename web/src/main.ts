// web/src/main.ts
import { getGraph, getSystem, reloadData, SystemItem } from "./api";
import { initGraph } from "./graph";
import { initHulls } from "./hulls";
import { initInspector, renderSystemItem } from "./inspector";
import { initRing } from "./ring";
import { initPie } from "./pie";
import { initMinimap } from "./minimap";
import { initSearch, buildNoteIndex, buildSystemIndex, SearchIndex } from "./search";
import { initInsights } from "./insights";
import { loadInspectorWidth, saveInspectorWidth } from "./store";

type Mode = "graph" | "pie" | "ring";

async function boot() {
  const data = await getGraph();
  const container = document.getElementById("cy")!;
  const graph = initGraph(container, data);
  initHulls(graph.cy); // zeichnet die Cluster-Wolken hinter den Knoten

  const inspectorEl = document.getElementById("inspector")!;
  const inspect = initInspector(inspectorEl, data, (targetId) => {
    graph.focus(targetId);
    graph.flyTo(targetId);
    openNote(targetId);
  });
  (window as any).__inspect = inspect;

  // --- Navigations-History (Browser-artig, in-memory pro Session) ---------
  // Deckt Notizen (inspect) und System-Einträge (renderSystemItem) ab. Alle
  // User-Öffnungen laufen über openNote/openSys → pushen in den Stack; ⟵/⟶
  // stellen wieder her, ohne erneut zu pushen (navigating-Flag).
  type HistEntry = { kind: "note" | "sys"; id: string };
  const hist: HistEntry[] = [];
  let hIdx = -1;
  let navigating = false;
  const navBack = document.getElementById("nav-back") as HTMLButtonElement;
  const navFwd = document.getElementById("nav-fwd") as HTMLButtonElement;
  function updateNavButtons() {
    navBack.disabled = hIdx <= 0;
    navFwd.disabled = hIdx >= hist.length - 1;
  }
  function pushHistory(e: HistEntry) {
    if (navigating) return;
    if (hist[hIdx]?.kind === e.kind && hist[hIdx]?.id === e.id) return; // Doppelklick
    hist.splice(hIdx + 1); // Forward-Zweig kappen
    hist.push(e);
    hIdx = hist.length - 1;
    updateNavButtons();
  }
  function restore(e: HistEntry) {
    navigating = true;
    if (e.kind === "note") inspect(e.id);
    else { const it = sysById.get(e.id); if (it) renderSystemItem(inspectorEl, it); }
    navigating = false;
  }
  function openNote(id: string, hl = "") { pushHistory({ kind: "note", id }); inspect(id, hl); }
  function openSys(item: SystemItem, hl = "") {
    pushHistory({ kind: "sys", id: item.id });
    renderSystemItem(inspectorEl, item, hl);
  }
  navBack.addEventListener("click", () => { if (hIdx > 0) { hIdx--; restore(hist[hIdx]); updateNavButtons(); } });
  navFwd.addEventListener("click", () => { if (hIdx < hist.length - 1) { hIdx++; restore(hist[hIdx]); updateNavButtons(); } });
  updateNavButtons();

  // Klick auf einen Knoten → Nachbarschaft hervorheben + Inspektor öffnen.
  graph.onNodeClick((id) => {
    graph.focus(id);
    openNote(id);
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
  const searchResultsEl = document.getElementById("results")!;
  const search = initSearch(searchEl, searchResultsEl);
  // Notiz-Index (~4 MB) wird lazy im Hintergrund gebaut, damit der UI-Start
  // (Graph + Views) nicht auf das Fetchen + Indizieren wartet. Bis er bereit ist,
  // liefert die Wrapper-Funktion keine Treffer (Ring-Suche funktioniert sofort,
  // da sie aus den bereits geladenen System-Daten kommt).
  let noteIndex: SearchIndex | null = null;
  const noteSearch: SearchIndex = (q) => (noteIndex ? noteIndex(q) : []);

  const systemData = await getSystem();

  // System-Ring: zweiter Modus (nur das System, konzentrisch).
  const ring = initRing(
    document.getElementById("ring")!,
    document.getElementById("ring-guides") as HTMLCanvasElement,
    systemData,
  );
  ring.onItemClick((item) => openSys(item));
  // Klick auf leere Ringfläche → Inspektor schließen (wie im Graph-Modus).
  ring.cy.on("tap", (e) => {
    if (e.target === ring.cy) inspectorEl.classList.add("hidden");
  });

  // Kuchen: dritter Modus. Vault-Inhalt als Kuchendiagramm innen + System-Ringe außen.
  const pie = initPie(
    document.getElementById("pie")!,
    document.getElementById("pie-guides") as HTMLCanvasElement,
    data,
    systemData,
  );
  pie.onNodeClick((id) => openNote(id));
  pie.onSystemClick((item) => openSys(item));
  pie.cy.on("tap", (e) => {
    if (e.target === pie.cy) inspectorEl.classList.add("hidden");
  });

  // Kuchen-Filter: Cluster-Ebene + isolierte Notizen (wie im Graph).
  const pieDepth = document.getElementById("pie-depth") as HTMLSelectElement;
  pieDepth.value = String(pie.initial.depth);
  pieDepth.addEventListener("change", () => pie.setDepth(parseInt(pieDepth.value, 10)));
  const pieOrphans = document.getElementById("pie-orphans") as HTMLInputElement;
  pieOrphans.checked = pie.initial.orphansShown;
  pieOrphans.addEventListener("change", () => pie.showOrphans(pieOrphans.checked));

  // Suche je Modus: Graph + Kuchen suchen Notizen, der System-Ring sucht System-Einträge.
  const systemIndex = buildSystemIndex(systemData);
  const sysById = new Map<string, SystemItem>();
  for (const items of Object.values(systemData.segments))
    for (const it of items) sysById.set(it.id, it);

  const searchSources: Record<
    Mode,
    { index: SearchIndex; onPick: (id: string, query: string) => void; placeholder: string }
  > = {
    graph: {
      index: noteSearch,
      onPick: (id, q) => { graph.focus(id); graph.flyTo(id); openNote(id, q); },
      placeholder: "Suche im Vault …",
    },
    pie: {
      index: noteSearch,
      onPick: (id, q) => { pie.focus(id); openNote(id, q); },
      placeholder: "Notiz im Kuchen suchen …",
    },
    ring: {
      index: systemIndex,
      onPick: (id, q) => {
        ring.focus(id);
        const it = sysById.get(id);
        if (it) openSys(it, q);
      },
      placeholder: "Skill / Command / MCP suchen …",
    },
  };
  const applySearchSource = (mode: Mode) => {
    const s = searchSources[mode];
    search.setSource(s.index, s.onPick, s.placeholder);
    searchEl.value = "";
  };
  applySearchSource("graph"); // Startmodus

  // Minimap: kleine Übersicht unten links, zeigt immer das aktive View.
  const minimap = initMinimap(document.getElementById("minimap") as HTMLCanvasElement);
  minimap.setCy(graph.cy);

  const modeGraphBtn = document.getElementById("mode-graph") as HTMLButtonElement;
  const modePieBtn = document.getElementById("mode-pie") as HTMLButtonElement;
  const modeRingBtn = document.getElementById("mode-ring") as HTMLButtonElement;
  const graphControls = document.getElementById("graph-controls")!;
  const pieControls = document.getElementById("pie-controls")!;
  const cyEl = document.getElementById("cy")!;
  const hullsEl = document.getElementById("hulls")!;

  function setMode(mode: Mode) {
    modeGraphBtn.classList.toggle("active", mode === "graph");
    modePieBtn.classList.toggle("active", mode === "pie");
    modeRingBtn.classList.toggle("active", mode === "ring");
    // Graph + Kuchen haben je eigene Filter-Controls; die Suche gilt in allen Modi.
    graphControls.style.display = mode === "graph" ? "" : "none";
    pieControls.style.display = mode === "pie" ? "" : "none";
    cyEl.style.display = mode === "graph" ? "" : "none";
    hullsEl.style.display = mode === "graph" ? "" : "none";
    inspectorEl.classList.add("hidden");
    // Views ein-/ausblenden
    if (mode === "pie") { pie.show(); pie.clearSelection(); } else { pie.hide(); }
    if (mode === "ring") { ring.show(); ring.clearSelection(); } else { ring.hide(); }
    if (mode === "graph") graph.cy.resize();
    // Suche auf den Modus umstellen (Notizen ↔ System) + Feld leeren.
    applySearchSource(mode);
    // Minimap folgt dem aktiven View
    minimap.setCy(mode === "pie" ? pie.cy : mode === "ring" ? ring.cy : graph.cy);
  }
  modeGraphBtn.addEventListener("click", () => setMode("graph"));
  modePieBtn.addEventListener("click", () => setMode("pie"));
  modeRingBtn.addEventListener("click", () => setMode("ring"));

  // Vault neu einlesen: Server-Cache leeren, dann Seite neu laden (holt Graph +
  // System + Index frisch; die Handanordnung überlebt via localStorage).
  const reloadBtn = document.getElementById("reload-data") as HTMLButtonElement;
  reloadBtn.addEventListener("click", async () => {
    reloadBtn.disabled = true;
    reloadBtn.textContent = "… lädt";
    try {
      await reloadData();
      location.reload();
    } catch (e) {
      console.error("Vault-Reload fehlgeschlagen:", e);
      reloadBtn.disabled = false;
      reloadBtn.textContent = "🔄 Vault neu laden";
    }
  });

  // Wartungs-Overlay (Orphans / Hubs / tote Links). Klick auf einen Eintrag →
  // in den Graph-Modus wechseln, hinfliegen, Knoten markieren, Inspektor öffnen.
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const insightsEl = document.getElementById("insights")!;
  await initInsights(
    insightsEl,
    (id) => byId.get(id)?.label ?? id,
    (id) => {
      setMode("graph");
      graph.focus(id);
      graph.flyTo(id);
      openNote(id);
    },
  );
  const insToggle = document.getElementById("toggle-insights") as HTMLButtonElement;
  insToggle.addEventListener("click", () => insightsEl.classList.toggle("hidden"));

  // Inspektor-Breite: gespeicherte Breite anwenden + Zieh-Griff verdrahten.
  // Der Inspektor überlagert den Graph (kein Layout-Shift) → kein cy.resize nötig.
  const savedW = loadInspectorWidth();
  if (savedW) document.documentElement.style.setProperty("--inspector-w", `${savedW}px`);
  const resizeHandle = document.getElementById("inspector-resize")!;
  resizeHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(900, Math.max(280, window.innerWidth - ev.clientX));
      document.documentElement.style.setProperty("--inspector-w", `${w}px`);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const cur = getComputedStyle(document.documentElement).getPropertyValue("--inspector-w");
      const px = parseInt(cur, 10);
      if (px) saveInspectorWidth(px);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  (window as any).__graph = graph;
  (window as any).__ring = ring;
  (window as any).__pie = pie;
  (window as any).__data = data;

  // Erst wenn die UI steht: Notiz-Index im Hintergrund laden (Fetch + Indizieren
  // blockieren die Suche kurz, aber der Graph ist längst sichtbar). setTimeout gibt
  // dem Browser Zeit, zuerst zu zeichnen.
  setTimeout(() => {
    buildNoteIndex()
      .then((idx) => { noteIndex = idx; })
      .catch((e) => console.error("Notiz-Index konnte nicht geladen werden:", e));
  }, 0);
}
boot().catch((e) => console.error(e));
