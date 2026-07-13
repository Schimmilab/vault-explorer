// web/src/store.ts
// Persistenz der Handanordnung im Browser (localStorage) — bewusst NICHT im Backend/Vault,
// damit das Repo öffentlich bleiben kann und die Anordnung rechner-/vault-lokal bleibt.

const KEY = "vaultexplorer";

export interface Persisted {
  depth: number;
  orphansShown: boolean;
  globalCompact: number;
  compact: Record<string, number>;
}

type Pos = Record<string, { x: number; y: number }>;

export function loadState(): Partial<Persisted> {
  try {
    return JSON.parse(localStorage.getItem(`${KEY}.state`) || "{}");
  } catch {
    return {};
  }
}

export function saveState(s: Persisted): void {
  try {
    localStorage.setItem(`${KEY}.state`, JSON.stringify(s));
  } catch {
    /* localStorage nicht verfügbar / voll → still ignorieren */
  }
}

export function loadPositions(depth: number): Pos | null {
  try {
    const v = localStorage.getItem(`${KEY}.pos.d${depth}`);
    return v ? (JSON.parse(v) as Pos) : null;
  } catch {
    return null;
  }
}

export function savePositions(depth: number, pos: Pos): void {
  try {
    localStorage.setItem(`${KEY}.pos.d${depth}`, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

export function clearPositions(depth: number): void {
  try {
    localStorage.removeItem(`${KEY}.pos.d${depth}`);
  } catch {
    /* ignore */
  }
}
