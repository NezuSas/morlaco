"""Índice de calles de Cuenca, de OpenStreetMap.

Sirve para buscar direcciones dentro de la página sin depender de un servicio
externo: en Cuenca las direcciones se dan como intersecciones ("Av. Solano y
Remigio Crespo"), y para encontrarlas hace falta la geometría de cada calle.

Se descargan con la API Overpass todas las vías con nombre dentro de la ciudad,
se agrupan por nombre y se simplifica su trazado (unos pocos metros de
tolerancia) para que el archivo pese poco.
"""

from __future__ import annotations

import json
import math
from typing import Any
from urllib.parse import urlencode

from morlaco import red
from morlaco.comun import Resultado, decodificar, limpiar

OVERPASS = "https://overpass-api.de/api/interpreter"
# Sur, oeste, norte, este: la ciudad de Cuenca y sus alrededores inmediatos.
CAJA = (-2.98, -79.10, -2.82, -78.92)
CONSULTA = (
    "[out:json][timeout:150];"
    f'way["highway"]["name"]({CAJA[0]},{CAJA[1]},{CAJA[2]},{CAJA[3]});'
    "out tags geom;"
)

# Vías que no sirven para ubicar una dirección.
EXCLUIDAS = {
    "path",
    "steps",
    "footway",
    "track",
    "service",
    "cycleway",
    "bridleway",
    "proposed",
    "construction",
    "platform",
    "corridor",
}
# Importancia de cada tipo de vía, para desempatar búsquedas (mayor es más importante).
RANGO = {
    "motorway": 9,
    "trunk": 8,
    "primary": 7,
    "secondary": 6,
    "tertiary": 5,
    "unclassified": 4,
    "residential": 3,
    "living_street": 2,
    "pedestrian": 2,
}
OTROS_NOMBRES = ("alt_name", "old_name", "official_name", "short_name", "loc_name")
TOLERANCIA_METROS = 4.0
_METROS_POR_GRADO = 111_320


def _a_metros(punto: list[float], latitud_ref: float) -> tuple[float, float]:
    lon, lat = punto
    return lon * _METROS_POR_GRADO * math.cos(math.radians(latitud_ref)), lat * _METROS_POR_GRADO


def _distancia_a_segmento(p, a, b) -> float:
    (px, py), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    largo2 = dx * dx + dy * dy
    if largo2 == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / largo2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplificar(
    linea: list[list[float]], tolerancia: float = TOLERANCIA_METROS
) -> list[list[float]]:
    """Douglas-Peucker sobre lon/lat, con la tolerancia en metros."""
    if len(linea) <= 2:
        return linea
    ref = linea[0][1]
    metros = [_a_metros(p, ref) for p in linea]
    conservar = [False] * len(linea)
    conservar[0] = conservar[-1] = True
    pila = [(0, len(linea) - 1)]
    while pila:
        inicio, fin = pila.pop()
        mayor, indice = 0.0, -1
        for i in range(inicio + 1, fin):
            d = _distancia_a_segmento(metros[i], metros[inicio], metros[fin])
            if d > mayor:
                mayor, indice = d, i
        if indice != -1 and mayor > tolerancia:
            conservar[indice] = True
            pila.extend([(inicio, indice), (indice, fin)])
    return [p for p, ok in zip(linea, conservar, strict=True) if ok]


def parsear_overpass(contenido: bytes) -> dict[str, Any]:
    """Agrupa las vías por nombre en una FeatureCollection de MultiLineString."""
    elementos = json.loads(decodificar(contenido)).get("elements", [])
    calles: dict[str, dict[str, Any]] = {}
    for via in elementos:
        etiquetas = via.get("tags", {})
        tipo = etiquetas.get("highway", "")
        nombre = limpiar(etiquetas.get("name"))
        geometria = via.get("geometry") or []
        if not nombre or tipo in EXCLUIDAS or len(geometria) < 2:
            continue
        linea = [[round(p["lon"], 5), round(p["lat"], 5)] for p in geometria]
        calle = calles.setdefault(nombre, {"otros": set(), "rango": 0, "tipo": tipo, "lineas": []})
        calle["lineas"].append(simplificar(linea))
        for clave in OTROS_NOMBRES:
            for otro in (etiquetas.get(clave) or "").split(";"):
                otro = limpiar(otro)
                if otro and otro != nombre:
                    calle["otros"].add(otro)
        rango = RANGO.get(tipo, 1)
        if rango > calle["rango"]:
            calle["rango"], calle["tipo"] = rango, tipo

    entidades = [
        {
            "type": "Feature",
            "properties": {
                "nombre": nombre,
                "otros_nombres": sorted(calle["otros"]),
                "tipo": calle["tipo"],
                "rango": calle["rango"],
            },
            "geometry": {"type": "MultiLineString", "coordinates": sorted(calle["lineas"])},
        }
        for nombre, calle in sorted(calles.items())
    ]
    if not entidades:
        raise ValueError("Overpass no devolvió calles")
    return {
        "type": "FeatureCollection",
        "metadata": {
            "titulo": "Calles de Cuenca con nombre",
            "fuente": "OpenStreetMap, vía la API Overpass",
            "atribucion": "© colaboradores de OpenStreetMap",
            "licencia": "Open Database License (ODbL) 1.0",
            "nota": f"Trazado simplificado con una tolerancia de {TOLERANCIA_METROS:g} m.",
        },
        "features": entidades,
    }


def obtener(descargar: red.Descargador = red.descargar) -> Resultado:
    calles = parsear_overpass(descargar(f"{OVERPASS}?{urlencode({'data': CONSULTA})}"))
    return Resultado(
        archivos={"calles/calles.geojson": calles},
        resumen={
            "calles": len(calles["features"]),
            "tramos": sum(len(f["geometry"]["coordinates"]) for f in calles["features"]),
        },
    )
