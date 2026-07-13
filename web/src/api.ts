// web/src/api.ts
export interface GraphNode {
  id: string; label: string; area: string; kind: string;
  in_degree: number; out_degree: number; size: number;
  frontmatter: Record<string, unknown>;
}
export interface GraphEdge { source: string; target: string; kind: string; broken: boolean; }
export interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; }
export interface SearchDoc { id: string; title: string; area: string; text: string; }
export interface SystemItem { id: string; label: string; segment: string; meta: Record<string, string>; }
export interface SystemData { segments: Record<string, SystemItem[]>; counts: Record<string, number>; }

const j = async <T>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json() as Promise<T>;
};

export const getGraph = () => j<GraphData>("/api/graph");
export const getSearchDocs = () => j<SearchDoc[]>("/api/search-index");
export const getSystem = () => j<SystemData>("/api/system");
export const getNote = async (id: string) =>
  (await fetch(`/api/note/${id}`)).text();
export const openNote = (id: string) =>
  fetch("/api/open", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }) });
