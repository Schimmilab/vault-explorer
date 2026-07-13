// web/src/search.ts
import MiniSearch from "minisearch";
import { getSearchDocs } from "./api";

export async function initSearch(
  input: HTMLInputElement,
  onPick: (id: string) => void,
) {
  const docs = await getSearchDocs();
  const mini = new MiniSearch({
    fields: ["title", "text", "area"],
    storeFields: ["title", "area"],
    idField: "id",
    searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.2 },
  });
  mini.addAll(docs);

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const hits = mini.search(input.value);
    if (hits.length) onPick(String(hits[0].id));
  });
}
