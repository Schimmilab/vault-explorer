// web/src/insights.ts
// Wartungs-Overlay: listet Orphans, Hubs und tote Links (das "über Obsidian hinaus").
// Klick auf einen Eintrag → onPick(id) (Graph fliegt hin + markiert + Inspektor).
import { getInsights } from "./api";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface InsightsController {
  /** Nach Vault-Änderung neu laden (Server-Cache müsste dafür ohnehin neu). */
  refresh: () => Promise<void>;
}

export async function initInsights(
  panel: HTMLElement,
  labelOf: (id: string) => string,
  onPick: (id: string) => void,
): Promise<InsightsController> {
  const row = (id: string, main: string, sub: string) =>
    `<li class="ins-row" data-id="${esc(id)}" title="${esc(id)}">
       <span class="ins-main">${esc(main)}</span>
       <span class="ins-sub">${esc(sub)}</span>
     </li>`;

  async function render() {
    const data = await getInsights();
    const orphans = data.orphans.map((id) => row(id, labelOf(id), id)).join("");
    const hubs = data.hubs.map((id) => row(id, labelOf(id), id)).join("");
    // Tote Links: das Ziel existiert nicht → nicht im Graph. Klick fokussiert die
    // QUELL-Notiz (die den kaputten Link enthält), Sub-Zeile nennt das fehlende Ziel.
    const dead = data.dead_links
      .map((d) => row(d.source, labelOf(d.source), `→ ${d.target} (fehlt)`))
      .join("");
    const empty = `<li class="ins-empty">— keine —</li>`;

    panel.innerHTML = `
      <div class="ins-head">
        <h2>Wartung</h2>
        <button id="ins-close" title="Schließen">✕</button>
      </div>
      <details open>
        <summary>Isolierte Notizen <span class="ins-count">${data.orphans.length}</span></summary>
        <ul>${orphans || empty}</ul>
      </details>
      <details>
        <summary>Meistverlinkt (Hubs) <span class="ins-count">${data.hubs.length}</span></summary>
        <ul>${hubs || empty}</ul>
      </details>
      <details>
        <summary>Tote Links <span class="ins-count">${data.dead_links.length}</span></summary>
        <ul>${dead || empty}</ul>
      </details>
    `;

    panel.querySelector<HTMLButtonElement>("#ins-close")!.onclick = () =>
      panel.classList.add("hidden");
    panel.querySelectorAll<HTMLLIElement>(".ins-row").forEach((li) => {
      li.onclick = () => onPick(li.dataset.id!);
    });
  }

  await render();
  return { refresh: render };
}
