// web/src/search.ts
// Volltextsuche (MiniSearch, clientseitig). Pro View-Modus eine eigene Quelle:
// Graph + Kuchen suchen Vault-Notizen, der System-Ring sucht System-Einträge.
import MiniSearch from "minisearch";
import { getSearchDocs, SystemData } from "./api";

/** Ein Suchtreffer — genug zum Anzeigen in der Liste (Titel + Bereich) und Öffnen (id). */
export interface SearchHit { id: string; title: string; area?: string }

/** Optionaler Filter (Task 27): Notizen nach `area`, System nach `segment`. */
export interface SearchOpts { area?: string }

/** Eine Suchfunktion: Query (+ optional Filter) rein, gerankte Treffer raus. */
export type SearchIndex = (query: string, opts?: SearchOpts) => SearchHit[];

export interface SearchController {
  /** Aktive Quelle + Trefferaktion + Placeholder setzen (beim Moduswechsel).
   *  onPick bekommt neben der Treffer-ID auch die Suchanfrage (zum Highlighten). */
  setSource: (
    index: SearchIndex,
    onPick: (id: string, query: string) => void,
    placeholder: string,
  ) => void;
  /** Aktuellen Filter setzen (Task 27) + Liste neu rendern. */
  setFilter: (opts: SearchOpts) => void;
  /** Liste mit dem aktuellen Feldinhalt neu rendern (nach Filterwechsel). */
  refresh: () => void;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;");

/** Live-Trefferliste unter dem Suchfeld + Enter öffnet den obersten Treffer. */
export function initSearch(input: HTMLInputElement, resultsEl: HTMLElement): SearchController {
  let index: SearchIndex | null = null;
  let pick: (id: string, query: string) => void = () => {};
  let filter: SearchOpts = {};
  const MAX = 40;

  function hide() { resultsEl.classList.add("hidden"); resultsEl.innerHTML = ""; }

  function render(query: string): void {
    const hits = index && query.trim() ? index(query, filter) : [];
    if (!hits.length) { hide(); return; }
    resultsEl.classList.remove("hidden");
    resultsEl.innerHTML = hits.slice(0, MAX).map((h) =>
      `<div class="result-row" data-id="${esc(h.id)}">` +
      `<span class="r-title">${esc(h.title)}</span>` +
      (h.area ? `<span class="r-area">${esc(h.area)}</span>` : "") +
      `</div>`).join("");
    resultsEl.querySelectorAll<HTMLElement>(".result-row").forEach((row) => {
      row.onclick = () => { pick(row.dataset.id!, query); hide(); };
    });
  }

  input.addEventListener("input", () => render(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const hits = index && input.value.trim() ? index(input.value, filter) : [];
      if (hits.length) { pick(hits[0].id, input.value); hide(); }
    } else if (e.key === "Escape") { hide(); }
  });
  // Klick außerhalb von Feld + Liste schließt die Liste.
  document.addEventListener("mousedown", (e) => {
    const t = e.target as Node;
    if (t !== input && !resultsEl.contains(t)) hide();
  });

  return {
    setSource(idx, onPick, placeholder) {
      index = idx; pick = onPick; input.placeholder = placeholder;
      filter = {}; hide();
    },
    setFilter(opts) { filter = opts; render(input.value); },
    refresh() { render(input.value); },
  };
}

/** Vault-Notizen-Index (Titel + Volltext + Bereich). */
export async function buildNoteIndex(): Promise<SearchIndex> {
  const docs = await getSearchDocs();
  const mini = new MiniSearch({
    fields: ["title", "text", "area"],
    storeFields: ["title", "area"],
    idField: "id",
    searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.2 },
  });
  mini.addAll(docs);
  return (q, opts) => q.trim()
    ? mini.search(q, opts?.area ? { filter: (r) => r.area === opts.area } : {})
        .map((h) => ({ id: String(h.id), title: h.title as string, area: h.area as string }))
    : [];
}

/** System-Index (Skills / Commands / Memory / MCPs / Routines). */
export function buildSystemIndex(system: SystemData): SearchIndex {
  const docs = Object.values(system.segments)
    .flat()
    .map((it) => ({
      id: it.id,
      label: it.label,
      beschreibung: it.meta?.beschreibung ?? "",
      segment: it.segment,
    }));
  const mini = new MiniSearch({
    fields: ["label", "beschreibung", "segment"],
    storeFields: ["label", "segment"],
    idField: "id",
    searchOptions: { boost: { label: 3 }, prefix: true, fuzzy: 0.2 },
  });
  mini.addAll(docs);
  return (q, opts) => q.trim()
    ? mini.search(q, opts?.area ? { filter: (r) => r.segment === opts.area } : {})
        .map((h) => ({ id: String(h.id), title: h.label as string, area: h.segment as string }))
    : [];
}
