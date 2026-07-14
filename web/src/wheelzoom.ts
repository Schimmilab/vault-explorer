// Geräte-normalisierter Maus-/Trackpad-Zoom für Cytoscape.
//
// Warum: Cytoscapes eingebauter Wheel-Zoom nutzt eine einzige `wheelSensitivity`.
// Die lässt sich nicht gleichzeitig für ein macOS-Trackpad (viele kleine, hochfrequente
// Delta-Events) UND ein Windows-Mausrad (wenige, große diskrete Notches, teils
// deltaMode=1/Zeilen) passend einstellen — ein niedriger Wert fühlt sich am Rad träge an,
// ein hoher am Trackpad ruckartig.
//
// Fix: eigener Wheel-Handler, der das Delta über `deltaMode` normalisiert und den Zoom
// GEOMETRISCH anwendet (Faktor = exp(-delta * speed)). Damit multipliziert jedes normierte
// Pixel den Zoom um denselben Faktor → gleiches Gefühl auf Trackpad und Rad. Am Cursor
// verankert. Cytoscapes eigener Zoom wird per `userZoomingEnabled: false` deaktiviert.

import type { Core } from "cytoscape";

export function installWheelZoom(cy: Core, opts: { speed?: number } = {}): void {
  const container = cy.container();
  if (!container) return;

  // Zoom-Faktor-Exponent pro normalisiertem Delta-Pixel. Ein Windows-Notch (~100 px)
  // ergibt so ~exp(100*0.0016)-1 ≈ +17 % pro Raste; Trackpad-Deltas (~4–12 px) akkumulieren
  // weich. Empirisch guter Kompromiss für beide Eingabegeräte.
  const speed = opts.speed ?? 0.0016;

  container.addEventListener(
    "wheel",
    (ev: WheelEvent) => {
      ev.preventDefault();

      // Delta über deltaMode auf Pixel normalisieren (0=Pixel, 1=Zeilen, 2=Seiten).
      let dy = ev.deltaY;
      if (ev.deltaMode === 1) dy *= 16; // Zeilen → ~px
      else if (ev.deltaMode === 2) dy *= container.clientHeight; // Seiten → px

      // Ausreißer (Treiber/Browser senden teils riesige Deltas) begrenzen, damit ein
      // einzelnes Event nicht über-/durchzoomt.
      dy = Math.max(-120, Math.min(120, dy));
      if (dy === 0) return;

      // Geometrischer Zoom-Schritt, am Mauszeiger verankert. Cytoscape klemmt an min/maxZoom.
      const level = cy.zoom() * Math.exp(-dy * speed);
      const rect = container.getBoundingClientRect();
      cy.zoom({
        level,
        renderedPosition: { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
      });
    },
    { passive: false },
  );
}
