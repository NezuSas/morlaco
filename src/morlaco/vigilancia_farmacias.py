"""Cuida la lista de todas las farmacias (de OpenStreetMap) antes de publicarla.

Cualquiera puede editar OpenStreetMap, así que cada semana se compara la lista nueva con la
publicada:

- Lo que cambió (farmacias nuevas, quitadas o con otro nombre, horario o teléfono) se anota
  en `metadata.cambios` y la revisión diaria lo pone en el aviso de GitHub, con el enlace a
  cada una en OpenStreetMap, hasta que alguien lo revisa: si algo es falso, se deshace allí.
- Si en una semana llegan más de `TOPE` farmacias nuevas, o se quitan más de `TOPE`, eso no
  se publica: puede ser un ataque o un error grande. Quedan en `metadata.detenidas` y la
  página sigue con la lista anterior en esa parte hasta que alguien las revisa.

Se da por revisado lo anterior a la fecha `revisado` de `datos/manual/farmacias.json`: con
poner ahí la fecha del día, lo detenido se publica en la siguiente pasada y los cambios
dejan de avisarse.
"""

from __future__ import annotations

from datetime import date
from typing import Any

TOPE = 20  # más altas o bajas que esto en una semana se detienen hasta revisarlas
CAMPOS = ("nombre", "horario", "telefono", "direccion")
OSM = "https://www.openstreetmap.org"


def enlace(farmacia: dict[str, Any]) -> str:
    """La farmacia en OpenStreetMap, con su historial (quién la cambió y cuándo)."""
    return f"{OSM}/{farmacia['osm']}/history"


def _por_id(farmacias: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {f["osm"]: f for f in farmacias if f.get("osm")}


def _resumen(f: dict[str, Any]) -> dict[str, Any]:
    return {"osm": f["osm"], "nombre": f.get("nombre")}


def _fecha(texto: Any) -> date | None:
    try:
        return date.fromisoformat(str(texto)[:10])
    except (TypeError, ValueError):
        return None


def combinar(
    nueva: dict[str, Any],
    anterior: dict[str, Any] | None,
    revisado: date | None,
    hoy: date,
) -> dict[str, Any]:
    """La lista que se publica: la nueva, salvo lo detenido por el tope, con los cambios
    anotados en su metadata. Sin lista anterior (la primera vez), se publica tal cual."""
    if not anterior or not anterior.get("farmacias"):
        return nueva
    meta_anterior = anterior.get("metadata", {})
    antes = _por_id(anterior["farmacias"])
    ahora = _por_id(nueva["farmacias"])

    nuevas = [ahora[i] for i in ahora if i not in antes]
    quitadas = [antes[i] for i in antes if i not in ahora]
    cambiadas = [
        {**_resumen(ahora[i]), "campos": [c for c in CAMPOS if antes[i].get(c) != ahora[i].get(c)]}
        for i in ahora
        if i in antes and any(antes[i].get(c) != ahora[i].get(c) for c in CAMPOS)
    ]

    # El tope: lo que pasa de golpe se detiene, salvo que alguien ya lo haya revisado
    # (revisado igual o posterior al día en que se detuvo).
    detenidas_antes = meta_anterior.get("detenidas") or {}
    desde = _fecha(detenidas_antes.get("desde")) or hoy
    aceptadas = revisado is not None and revisado >= desde
    detener_nuevas = len(nuevas) > TOPE and not aceptadas
    detener_quitadas = len(quitadas) > TOPE and not aceptadas
    publicadas = [f for f in nueva["farmacias"] if not (detener_nuevas and f["osm"] not in antes)]
    if detener_quitadas:
        publicadas += quitadas
    detenidas = None
    if detener_nuevas or detener_quitadas:
        detenidas = {
            "desde": desde.isoformat(),
            "nuevas": len(nuevas) if detener_nuevas else 0,
            "quitadas": len(quitadas) if detener_quitadas else 0,
        }

    # Los cambios se acumulan hasta que alguien los revisa: si pasan dos semanas sin mirar,
    # no se pierde lo de la primera. Lo detenido no se anota aquí (va en "detenidas").
    cambios = [
        c
        for c in meta_anterior.get("cambios", [])
        if revisado is None or (_fecha(c.get("fecha")) or hoy) > revisado
    ]
    # Lo que estaba detenido y alguien aceptó ya se revisó: no se vuelve a avisar.
    ya_revisado = aceptadas and bool(detenidas_antes)
    tanda = {
        "nuevas": [] if detener_nuevas or ya_revisado else [_resumen(f) for f in nuevas],
        "quitadas": [] if detener_quitadas or ya_revisado else [_resumen(f) for f in quitadas],
        "cambiadas": cambiadas,
    }
    if any(tanda.values()):
        cambios.append({"fecha": hoy.isoformat(), **tanda})

    metadata = {**nueva["metadata"], "cambios": cambios}
    if detenidas:
        metadata["detenidas"] = detenidas
    return {
        "metadata": metadata,
        "farmacias": sorted(publicadas, key=lambda f: (f["nombre"] or "~", f["lat"], f["lon"])),
    }


def pendientes(publicadas: dict[str, Any] | None, revisado: date | None) -> list[str]:
    """Los puntos del aviso de revisión: lo detenido y los cambios sin revisar."""
    if not publicadas:
        return []
    meta = publicadas.get("metadata", {})
    como_revisar = (
        "Si todo está bien, pon la fecha de hoy en `revisado` de `datos/manual/farmacias.json`."
    )
    puntos = []
    detenidas = meta.get("detenidas")
    # Ya aceptado: se publica en la próxima actualización semanal, no hay que avisar más.
    if (
        detenidas
        and revisado is not None
        and revisado >= (_fecha(detenidas.get("desde")) or revisado)
    ):
        detenidas = None
    if detenidas:
        partes = []
        if detenidas.get("nuevas"):
            partes.append(f"{detenidas['nuevas']} farmacias nuevas")
        if detenidas.get("quitadas"):
            partes.append(f"{detenidas['quitadas']} farmacias quitadas")
        puntos.append(
            f"OpenStreetMap trae de golpe {' y '.join(partes)} (más de {TOPE} en una semana): "
            f"no se publican desde el {detenidas['desde']}. Mira los últimos cambios en "
            f"{OSM}/history#map=13/-2.9/-79.0 y deshaz lo que sea falso. " + como_revisar
        )
    cambios = [
        c
        for c in meta.get("cambios") or []
        if revisado is None or (_fecha(c.get("fecha")) or revisado) > revisado
    ]
    if cambios:
        juntos: dict[str, list[dict[str, Any]]] = {"nuevas": [], "quitadas": [], "cambiadas": []}
        for c in cambios:
            for clave in juntos:
                juntos[clave] += c.get(clave, [])

        def lista(farmacias: list[dict[str, Any]]) -> str:
            nombres = [f"[{f.get('nombre') or 'sin nombre'}]({enlace(f)})" for f in farmacias[:8]]
            mas = len(farmacias) - len(nombres)
            return ", ".join(nombres) + (f" y {mas} más" if mas > 0 else "")

        partes = [
            f"{len(farmacias)} {singular if len(farmacias) == 1 else plural}: {lista(farmacias)}"
            for clave, singular, plural in (
                ("nuevas", "nueva", "nuevas"),
                ("quitadas", "quitada", "quitadas"),
                ("cambiadas", "con cambios", "con cambios"),
            )
            if (farmacias := juntos[clave])
        ]
        desde = min(c["fecha"] for c in cambios)
        puntos.append(
            f"Cambiaron farmacias en OpenStreetMap desde el {desde}: "
            + "; ".join(partes)
            + ". Ya salen en la página; si alguna es falsa, deshazla en OpenStreetMap. "
            + como_revisar
        )
    return puntos
