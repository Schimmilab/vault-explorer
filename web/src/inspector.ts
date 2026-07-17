// web/src/inspector.ts
import MarkdownIt from "markdown-it";
import { getNote, openNote, getSystemFile, openSystemFile, GraphData, SystemItem } from "./api";

const md = new MarkdownIt({ html: false, linkify: true });

// Externe Links (http/https) in einem neuen Tab öffnen — gilt global für jede
// md.render-Ausgabe (Notiz-Preview + System-Vorschau). Interne Vault-Links
// (relative .md-Pfade) bleiben unberührt und werden weiter per onLinkTo abgefangen.
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href") ?? "";
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

const SEG_TITLE: Record<string, string> = {
  skills: "Skill", commands: "Command", memory: "Memory", mcps: "MCP", routines: "Routine",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Suchbegriff in Tokens zerlegen: ganze Wörter + Teilstücke an Satzzeichen
 *  (damit "E-Mail" auch "Email" trifft). Kurze Tokens (< 2) raus. */
function highlightTokens(query: string): string[] {
  const q = query.toLowerCase();
  const whole = q.split(/\s+/);
  const parts = q.split(/[^\p{L}\p{N}]+/u);
  const toks = [...new Set([...whole, ...parts])].filter((t) => t.length >= 2);
  return toks.sort((a, b) => b.length - a.length); // längste zuerst (Alternation)
}

/** Markiert alle Vorkommen der Suchbegriffe in den Textknoten von `root`
 *  mit <mark class="hl"> — arbeitet nur auf Textknoten, lässt Tags/Links heil. */
function highlightMatches(root: HTMLElement | null, query: string): void {
  if (!root) return;
  const toks = highlightTokens(query);
  if (!toks.length) return;
  const re = new RegExp(`(${toks.map(escRe).join("|")})`, "giu");

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);

  for (const tn of nodes) {
    const text = tn.nodeValue ?? "";
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const mark = document.createElement("mark");
      mark.className = "hl";
      mark.textContent = m[0];
      frag.appendChild(mark);
      last = m.index + m[0].length;
      if (m.index === re.lastIndex) re.lastIndex++; // Endlosschleife bei Leer-Match vermeiden
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    tn.parentNode?.replaceChild(frag, tn);
  }
}

/** Nach dem Highlighten zur ersten Fundstelle im Textkörper scrollen. */
function scrollToFirstHit(el: HTMLElement): void {
  const hit = el.querySelector<HTMLElement>(".preview mark, #sys-preview mark") ??
    el.querySelector<HTMLElement>("mark");
  hit?.scrollIntoView({ block: "center" });
}

/** Detailansicht für einen System-Ring-Eintrag: Kurzbeschreibung, Öffnen-Button
 *  und eine Inline-Markdown-Vorschau des Dateiinhalts (Skill/Command/Memory).
 *  MCPs haben keinen Pfad → nur Name + Segment. */
export async function renderSystemItem(
  el: HTMLElement, item: SystemItem, highlight = "",
): Promise<void> {
  const beschreibung = item.meta?.beschreibung ?? "";
  const pfad = item.meta?.pfad ?? "";
  el.classList.remove("hidden");
  el.dataset.current = item.id; // gegen Races bei schnellem Klicken
  el.innerHTML = `
    <h2>${esc(item.label)}</h2>
    <div class="path">${SEG_TITLE[item.segment] ?? item.segment}</div>
    ${beschreibung ? `<div class="desc">${md.render(beschreibung)}</div>` : ""}
    ${pfad ? `<button id="open-sys">In App öffnen</button>` : ""}
    ${pfad ? `<div class="preview" id="sys-preview">… lädt …</div>` : ""}
    ${pfad ? `<div class="path" style="margin-top:12px">${esc(pfad)}</div>` : ""}
  `;
  if (!pfad) {
    if (highlight) { highlightMatches(el, highlight); scrollToFirstHit(el); }
    return;
  }
  el.querySelector<HTMLButtonElement>("#open-sys")!.onclick = () => openSystemFile(pfad);
  const raw = await getSystemFile(pfad).catch(() => "*(Vorschau nicht ladbar)*");
  if (el.dataset.current !== item.id) return; // inzwischen anderer Eintrag angeklickt
  const prev = el.querySelector<HTMLDivElement>("#sys-preview");
  if (prev) prev.innerHTML = md.render(raw);
  if (highlight) { highlightMatches(el, highlight); scrollToFirstHit(el); }
}

export function initInspector(
  el: HTMLElement, data: GraphData,
  onLinkTo: (id: string) => void,
) {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));

  return async function inspect(id: string, highlight = "") {
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

    // Suchbegriff im Text markieren + zur ersten Fundstelle scrollen.
    if (highlight) {
      highlightMatches(el.querySelector<HTMLElement>(".preview"), highlight);
      scrollToFirstHit(el);
    }
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
