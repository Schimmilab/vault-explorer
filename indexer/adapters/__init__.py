"""Registry + Fehler-Isolation für Ring-Adapter."""
from typing import Callable


def safe(fn: Callable, segment: str) -> Callable:
    """Wrappt einen Adapter so, dass Fehler/fehlende Quellen zu [] werden."""
    def wrapped(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001 — bewusst breit: kein Segment darf crashen
            print(f"[ring:{segment}] Quelle nicht lesbar: {exc}")
            return []
    return wrapped
