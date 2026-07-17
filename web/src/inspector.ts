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

/** Highlightet die Suchbegriffe in mehreren Regionen (inkl. Titel <h2>), sammelt
 *  ALLE Treffer und blendet oben im Panel einen Navigator (◀ n/N ▶) ein, der von
 *  Fundstelle zu Fundstelle springt. Löst „nur erster Treffer" + „Titel nicht markiert". */
function applyHighlight(el: HTMLElement, query: string, selectors: string[]): void {
  if (!query) return;
  for (const sel of selectors)
    el.querySelectorAll<HTMLElement>(sel).forEach((r) => highlightMatches(r, query));
  const marks = [...el.querySelectorAll<HTMLElement>("mark.hl")];
  if (!marks.length) return;

  const bar = document.createElement("div");
  bar.className = "hitnav";
  const prev = document.createElement("button"); prev.textContent = "◀"; prev.title = "vorige Fundstelle";
  const next = document.createElement("button"); next.textContent = "▶"; next.title = "nächste Fundstelle";
  const label = document.createElement("span"); label.className = "hitcount";
  bar.append(prev, label, next);
  el.insertBefore(bar, el.firstChild);

  let cur = -1;
  const go = (i: number): void => {
    if (cur >= 0) marks[cur].classList.remove("active");
    cur = (i + marks.length) % marks.length;
    marks[cur].classList.add("active");
    marks[cur].scrollIntoView({ block: "center" });
    label.textContent = `${cur + 1} / ${marks.length}`;
  };
  prev.onclick = () => go(cur - 1);
  next.onclick = () => go(cur + 1);
  go(0);
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
    applyHighlight(el, highlight, ["h2", ".desc"]);
    return;
  }
  el.querySelector<HTMLButtonElement>("#open-sys")!.onclick = () => openSystemFile(pfad);
  const raw = await getSystemFile(pfad).catch(() => "*(Vorschau nicht ladbar)*");
  if (el.dataset.current !== item.id) return; // inzwischen anderer Eintrag angeklickt
  const prev = el.querySelector<HTMLDivElement>("#sys-preview");
  if (prev) prev.innerHTML = md.render(raw);
  applyHighlight(el, highlight, ["h2", ".desc", "#sys-preview"]);
}

export function initInspector(
  el: HTMLElement, data: GraphData,
  onLinkTo: (id: string) => void,
) {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));

  // Eine Gruppe verlinkter Nachbarknoten (eingehend/ausgehend) als aufklappbares
  // Dropdown (<details>) — bei Hub-Notizen sind es viele, deshalb standardmäßig zu.
  const linkList = (ids: string[], head: string): string => {
    if (!ids.length) return "";
    const items = ids
      .map((nid) => ({ nid, label: byId.get(nid)?.label ?? nid }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(({ nid, label }) => `<li><a class="linkref" data-id="${esc(nid)}">${esc(label)}</a></li>`)
      .join("");
    return `<details class="linkgroup"><summary>${head} <span class="linkcount">${ids.length}</span></summary><ul>${items}</ul></details>`;
  };

  return async function inspect(id: string, highlight = "") {
    const node = byId.get(id);
    if (!node) return;
    // Eindeutige Nachbarknoten (mehrfache Links auf dieselbe Notiz nur einmal zeigen).
    const inbound = [...new Set(data.edges.filter((e) => e.target === id && !e.broken).map((e) => e.source))];
    const outbound = [...new Set(data.edges.filter((e) => e.source === id && !e.broken).map((e) => e.target))];
    const raw = await getNote(id).catch(() => "*(Vorschau nicht ladbar)*");

    el.classList.remove("hidden");
    el.innerHTML = `
      <h2>${node.label}</h2>
      <div class="path">${id}</div>
      <button id="open-btn">In App öffnen</button>
      ${linkList(outbound, "→ Ausgehend")}
      ${linkList(inbound, "← Eingehend")}
      <div class="preview">${md.render(raw)}</div>
    `;
    el.querySelector<HTMLButtonElement>("#open-btn")!.onclick = () => openNote(id);

    // Nachbarknoten-Links (ein-/ausgehend) klickbar → hin navigieren (inkl. History + Graph-Fokus).
    el.querySelectorAll<HTMLAnchorElement>("a.linkref").forEach((a) => {
      a.onclick = (ev) => {
        ev.preventDefault();
        const t = a.dataset.id!;
        if (byId.has(t)) onLinkTo(t);
      };
    });

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

    // Suchbegriff in Titel + Vorschau markieren, Treffer-Navigator einblenden.
    applyHighlight(el, highlight, ["h2", ".preview"]);
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
