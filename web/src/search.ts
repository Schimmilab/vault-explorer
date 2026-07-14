// web/src/search.ts
// Volltextsuche (MiniSearch, clientseitig). Pro View-Modus eine eigene Quelle:
// Graph + Kuchen suchen Vault-Notizen, der System-Ring sucht System-Einträge.
import MiniSearch from "minisearch";
import { getSearchDocs, SystemData } from "./api";

/** Eine Suchfunktion: Query rein, gerankte Treffer-IDs raus. */
export type SearchIndex = (query: string) => string[];

export interface SearchController {
  /** Aktive Quelle + Trefferaktion + Placeholder setzen (beim Moduswechsel). */
  setSource: (index: SearchIndex, onPick: (id: string) => void, placeholder: string) => void;
}

/** Enter im Suchfeld → obersten Treffer der aktiven Quelle an onPick geben. */
export function initSearch(input: HTMLInputElement): SearchController {
  let index: SearchIndex | null = null;
  let pick: (id: string) => void = () => {};

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !index) return;
    const ids = index(input.value);
    if (ids.length) pick(ids[0]);
  });

  return {
    setSource(idx, onPick, placeholder) {
      index = idx;
      pick = onPick;
      input.placeholder = placeholder;
    },
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
  return (q) => (q.trim() ? mini.search(q).map((h) => String(h.id)) : []);
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
    storeFields: ["label"],
    idField: "id",
    searchOptions: { boost: { label: 3 }, prefix: true, fuzzy: 0.2 },
  });
  mini.addAll(docs);
  return (q) => (q.trim() ? mini.search(q).map((h) => String(h.id)) : []);
}
