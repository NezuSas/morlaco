"""Estaciones de BiciPública, ciclovías y puntos de carga eléctrica, de OpenStreetMap.

El portal municipal publica estas capas, pero las versiones actuales vienen en
archivos RAR (que necesitan un programa aparte para abrirse) y los puntos de
carga solo como enlace a un mapa externo. OpenStreetMap tiene las tres, con el
nombre y la capacidad de cada estación de BiciCuenca y si cada punto de carga
es público o solo para clientes.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlencode

from morlaco import red
from morlaco.comun import Resultado, decodificar, limpiar
from morlaco.fuentes.calles import CAJA, OVERPASS, simplificar

_CAJA = f"({CAJA[0]},{CAJA[1]},{CAJA[2]},{CAJA[3]})"
CONSULTA = (
    "[out:json][timeout:150];"
    f'(nwr["amenity"="bicycle_rental"]{_CAJA};nwr["amenity"="charging_station"]{_CAJA};)->.puntos;'
    ".puntos out center tags;"
    f'(way["highway"="cycleway"]{_CAJA};'
    f'way["cycleway"~"^(lane|track|separate)$"]{_CAJA};'
    f'way["cycleway:both"~"^(lane|track|separate)$"]{_CAJA};'
    f'way["cycleway:right"~"^(lane|track|separate)$"]{_CAJA};'
    f'way["cycleway:left"~"^(lane|track|separate)$"]{_CAJA};)->.ciclo;'
    ".ciclo out tags geom;"
)
METADATA = {
    "fuente": "OpenStreetMap, vía la API Overpass",
    "atribucion": "© colaboradores de OpenStreetMap",
    "licencia": "Open Database License (ODbL) 1.0",
}


def _punto(elemento: dict[str, Any]) -> list[float] | None:
    if "lat" in elemento and "lon" in elemento:
        return [round(elemento["lon"], 6), round(elemento["lat"], 6)]
    centro = elemento.get("center")
    if centro:
        return [round(centro["lon"], 6), round(centro["lat"], 6)]
    return None


def _entero(texto: Any) -> int | None:
    try:
        return int(str(texto).strip())
    except (TypeError, ValueError):
        return None


def _bicicleta(etiquetas: dict[str, str]) -> dict[str, Any]:
    return {
        "nombre": limpiar(etiquetas.get("name")) or "Estación de BiciPública",
        "red": limpiar(etiquetas.get("network")) or None,
        "capacidad": _entero(etiquetas.get("capacity")),
    }


def _carga(etiquetas: dict[str, str]) -> dict[str, Any]:
    acceso = limpiar(etiquetas.get("access"))
    conectores = sorted(
        clave.removeprefix("socket:")
        for clave, valor in etiquetas.items()
        if clave.startswith("socket:") and clave.count(":") == 1 and valor not in ("no", "0")
    )
    operador = limpiar(etiquetas.get("operator"))
    return {
        "nombre": limpiar(etiquetas.get("name")) or operador or "Punto de carga",
        "operador": operador or None,
        # "yes" o vacío: público; "customers": para clientes; "private": privado.
        "acceso": {"": "publico", "yes": "publico", "public": "publico", "permissive": "publico",
                   "customers": "clientes", "private": "privado"}.get(acceso, acceso),
        "conectores": conectores,
    }  # fmt: skip


def _tipo_ciclovia(etiquetas: dict[str, str]) -> str:
    """'separada' (vía exclusiva o carril protegido) o 'carril' (pintado en la calzada)."""
    if etiquetas.get("highway") == "cycleway":
        return "separada"
    valores = {
        etiquetas.get(k, "")
        for k in ("cycleway", "cycleway:both", "cycleway:right", "cycleway:left")
    }
    return "separada" if valores & {"track", "separate"} else "carril"


def parsear_overpass(contenido: bytes) -> dict[str, dict[str, Any]]:
    """Las tres capas como FeatureCollection."""
    elementos = json.loads(decodificar(contenido)).get("elements", [])
    bicicletas, carga, ciclovias = [], [], []
    for elemento in elementos:
        etiquetas = elemento.get("tags", {})
        amenidad = etiquetas.get("amenity")
        if amenidad in ("bicycle_rental", "charging_station"):
            punto = _punto(elemento)
            if not punto:
                continue
            destino, propiedades = (
                (bicicletas, _bicicleta(etiquetas))
                if amenidad == "bicycle_rental"
                else (carga, _carga(etiquetas))
            )
            destino.append(
                {
                    "type": "Feature",
                    "properties": {"id": f"{elemento['type']}/{elemento['id']}", **propiedades},
                    "geometry": {"type": "Point", "coordinates": punto},
                }
            )
        elif elemento.get("type") == "way" and len(elemento.get("geometry") or []) >= 2:
            linea = [[round(p["lon"], 5), round(p["lat"], 5)] for p in elemento["geometry"]]
            ciclovias.append(
                {
                    "type": "Feature",
                    "properties": {
                        "id": f"way/{elemento['id']}",
                        "nombre": limpiar(etiquetas.get("name")) or None,
                        "tipo": _tipo_ciclovia(etiquetas),
                    },
                    "geometry": {"type": "LineString", "coordinates": simplificar(linea)},
                }
            )
    if not (bicicletas or carga or ciclovias):
        raise ValueError("Overpass no devolvió ninguna capa de movilidad")
    por_id = lambda e: e["properties"]["id"]  # noqa: E731
    return {
        "bicicletas": {
            "type": "FeatureCollection",
            "metadata": {"titulo": "Estaciones de bicicleta pública (BiciCuenca)", **METADATA},
            "features": sorted(bicicletas, key=por_id),
        },
        "carga": {
            "type": "FeatureCollection",
            "metadata": {"titulo": "Puntos de carga para autos eléctricos", **METADATA},
            "features": sorted(carga, key=por_id),
        },
        "ciclovias": {
            "type": "FeatureCollection",
            "metadata": {"titulo": "Ciclovías y carriles para bicicleta", **METADATA},
            "features": sorted(ciclovias, key=por_id),
        },
    }


def obtener(descargar: red.Descargador = red.descargar) -> Resultado:
    capas = parsear_overpass(descargar(f"{OVERPASS}?{urlencode({'data': CONSULTA})}"))
    return Resultado(
        archivos={f"movilidad/{nombre}.geojson": capa for nombre, capa in capas.items()},
        resumen={nombre: len(capa["features"]) for nombre, capa in capas.items()},
    )
