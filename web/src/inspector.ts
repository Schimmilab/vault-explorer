// web/src/inspector.ts
import MarkdownIt from "markdown-it";
import { getNote, openNote, GraphData, SystemItem } from "./api";

const md = new MarkdownIt({ html: false, linkify: true });

const SEG_TITLE: Record<string, string> = {
  skills: "Skill", commands: "Command", memory: "Memory", mcps: "MCP", routines: "Routine",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Detailansicht für einen System-Ring-Eintrag (kein Vault-Note, daher kein
 *  "In App öffnen" — die Quellen liegen teils außerhalb des Vaults). */
export function renderSystemItem(el: HTMLElement, item: SystemItem): void {
  const beschreibung = item.meta?.beschreibung ?? "";
  const pfad = item.meta?.pfad ?? "";
  el.classList.remove("hidden");
  el.innerHTML = `
    <h2>${esc(item.label)}</h2>
    <div class="path">${SEG_TITLE[item.segment] ?? item.segment}</div>
    ${beschreibung ? `<div class="preview">${md.render(beschreibung)}</div>` : ""}
    ${pfad ? `<div class="path" style="margin-top:12px">${esc(pfad)}</div>` : ""}
  `;
}

export function initInspector(
  el: HTMLElement, data: GraphData,
  onLinkTo: (id: string) => void,
) {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));

  return async function inspect(id: string) {
    const node = byId.get(id);
    if (!node) return;
    const inbound = data.edges.filter((e) => e.target === id && !e.broken).map((e) => e.source);
    const outbound = data.edges.filter((e) => e.source === id && !e.broken).map((e) => e.target);
    const raw = await getNote(id).catch(() => "*(Vorschau nicht ladbar)*");

    el.classList.remove("hidden");
    el.innerHTML = `
      <h2>${node.label}</h2>
      <div class="path">${id}</div>
      <div>← ${inbound.length} eingehend · ${outbound.length} ausgehend</div>
      <button id="open-btn">In App öffnen</button>
      <div class="preview">${md.render(raw)}</div>
    `;
    el.querySelector<HTMLButtonElement>("#open-btn")!.onclick = () => openNote(id);

    // Interne Vorschau-Links klickbar → Zielknoten ansteuern
    el.querySelectorAll<HTMLAnchorElement>(".preview a").forEach((a) => {
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("http") || href.startsWith("#")) return;
      a.onclick = (ev) => {
        ev.preventDefault();
        const target = resolveRel(id, href);
        if (byId.has(target)) onLinkTo(target);
      };
    });
  };
}

function resolveRel(sourceId: string, href: string): string {
  const base = sourceId.split("/").slice(0, -1);
  for (const part of href.split("#")[0].split("?")[0].split("/")) {
    if (part === "..") base.pop();
    else if (part !== "." && part !== "") base.push(part);
  }
  return base.join("/");
}
