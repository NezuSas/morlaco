"""¿Qué datos se están quedando viejos? Lo revisa el bot cada día.

Las fuentes automáticas se actualizan solas, pero hay cosas que nadie ve venir: un
aviso de línea que caduca, las farmacias de turno que se acaban antes de que ARCSA
publique el mes siguiente, un dato a mano que lleva meses sin revisarse o una fuente
que falla varios días seguidos. Este módulo las lista; el workflow las pone en un aviso
de GitHub para que una persona actúe antes de que la página muestre algo viejo.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DIAS_FARMACIAS = 7  # aviso si los turnos publicados se acaban en menos de esto
DIAS_AVISOS = 14  # aviso si un cambio de línea o los feriados vencen en menos de esto
DIAS_REVISION = 90  # aviso si un dato a mano lleva más de esto sin revisarse


def _leer(ruta: Path) -> dict[str, Any] | None:
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _fecha(texto: str | None) -> date | None:
    try:
        return date.fromisoformat(str(texto)[:10])
    except (TypeError, ValueError):
        return None


def revisar(datos: Path, hoy: date) -> list[dict[str, str]]:
    """Lo que necesita atención, de lo más urgente a lo menos. Cada punto: tema y mensaje."""
    pendientes: list[dict[str, str]] = []

    # 1. Fuentes que fallan: la página sigue mostrando lo último bueno, que puede envejecer.
    for nombre, e in sorted((_leer(datos / "estado.json") or {}).items()):
        if e.get("ok") is False:
            desde = _fecha(e.get("actualizado"))
            pendientes.append(
                {
                    "tema": nombre,
                    "mensaje": f"La fuente `{nombre}` falla"
                    + (f" desde el {desde.isoformat()}" if desde else "")
                    + f": {e.get('error', 'error desconocido')}",
                }
            )

    # 2. Farmacias de turno que se acaban.
    turnos = (_leer(datos / "farmacias" / "turnos.json") or {}).get("turnos", [])
    fin = max((f for t in turnos if (f := _fecha(t.get("fin")))), default=None)
    if fin is None:
        pendientes.append(
            {"tema": "farmacias", "mensaje": "No hay turnos de farmacias publicados."}
        )
    elif fin - hoy <= timedelta(days=DIAS_FARMACIAS):
        pendientes.append(
            {
                "tema": "farmacias",
                "mensaje": f"Los turnos de farmacias solo llegan hasta el {fin.isoformat()}. "
                "Revisa si ARCSA ya publicó el PDF del mes siguiente.",
            }
        )

    # 3. Cambios de líneas que vencen pronto: confirmar si siguen o quitarlos.
    transporte = _leer(datos / "manual" / "transporte.json") or {}
    # Los que vencen el mismo día van en un solo punto.
    por_fecha: dict[date, list[str]] = {}
    for aviso in transporte.get("avisos", []):
        hasta = _fecha(aviso.get("hasta"))
        if hasta and hoy <= hasta and hasta - hoy <= timedelta(days=DIAS_AVISOS):
            por_fecha.setdefault(hasta, []).extend(aviso.get("lineas", []))
    for hasta, lineas in sorted(por_fecha.items()):
        unicas = list(dict.fromkeys(lineas))
        quien = (
            f"de la línea {unicas[0]}" if len(unicas) == 1 else "de las líneas " + ", ".join(unicas)
        )
        pendientes.append(
            {
                "tema": "transporte",
                "mensaje": f"El aviso {quien} vence el {hasta.isoformat()}. "
                "Confirma si el cambio sigue y alarga su fecha, o deja que caduque.",
            }
        )

    # 4. Feriados de la basura.
    basura = _leer(datos / "manual" / "basura.json") or {}
    hasta = _fecha(basura.get("feriados", {}).get("hasta"))
    if hasta and hasta - hoy <= timedelta(days=DIAS_AVISOS):
        pendientes.append(
            {
                "tema": "basura",
                "mensaje": f"El aviso de feriados de la basura vence el {hasta.isoformat()}. "
                "Revisa qué dijo EMAC en los últimos feriados y alarga su fecha.",
            }
        )

    # 5. Datos a mano que llevan mucho sin revisarse.
    for archivo, que in (
        ("transporte.json", "el pasaje y los cambios de líneas"),
        ("basura.json", "los feriados y dónde llevar cada cosa"),
    ):
        revisado = _fecha(
            (_leer(datos / "manual" / archivo) or {}).get("metadata", {}).get("revisado")
        )
        if revisado and hoy - revisado > timedelta(days=DIAS_REVISION):
            pendientes.append(
                {
                    "tema": "manual",
                    "mensaje": f"`datos/manual/{archivo}` no se revisa desde el "
                    f"{revisado.isoformat()}: "
                    f"comprueba {que} y actualiza `metadata.revisado`.",
                }
            )
    return pendientes


def informe(pendientes: list[dict[str, str]], hoy: date) -> str:
    """El cuerpo del aviso de GitHub: una lista de tareas."""
    if not pendientes:
        return ""
    lineas = [f"Revisión automática del {hoy.isoformat()}. Esto necesita atención:", ""]
    lineas += [f"- [ ] {p['mensaje']}" for p in pendientes]
    lineas += ["", "Este aviso se actualiza cada día y se cierra solo cuando todo está al día."]
    return "\n".join(lineas) + "\n"


def hoy_en_cuenca() -> date:
    return (datetime.now(timezone.utc) - timedelta(hours=5)).date()
