"""Trazado de las líneas de bus y del tranvía, del portal Cuenca en Datos.

El conjunto "Rutas de transporte público" incluye un shapefile (ZIP) con el
recorrido de cada línea en cada sentido, en coordenadas UTM 17 Sur. Además de
las líneas, trae los "alargues" (prolongaciones de algunas líneas hasta barrios
más lejanos), los alimentadores y el tranvía.

Aviso: el último shapefile publicado es de septiembre de 2022; algunas líneas
han cambiado desde entonces. Los horarios y las frecuencias salen del CSV de
rutas, que sí está más al día.
"""

from __future__ import annotations

import io
import re
import zipfile
from typing import Any

import shapefile

from morlaco import comun
from morlaco.comun import limpiar
from morlaco.fuentes.calles import simplificar
from morlaco.geo import utm_a_geograficas

_PREFIJO_ALARGUE = re.compile(r"^ALARGUE\s+(?:IDA?N?|RETORNO|ID)?\s*", re.IGNORECASE)
_PREFIJO_LINEA = re.compile(r"^(L|A|T)(\d+[A-Z]?)\s+(.*)$")


def zip_mas_reciente(paquete: dict[str, Any]) -> dict[str, Any]:
    """El ZIP con geometría más reciente de un conjunto de datos de CKAN."""
    zips = [
        r
        for r in paquete.get("resources", [])
        if (r.get("format") or "").upper() == "ZIP" and "geo" in (r.get("name") or "").lower()
    ]
    if not zips:
        raise ValueError(f"El conjunto {paquete.get('name')!r} no tiene un ZIP con geometría")
    return max(zips, key=lambda r: r.get("created") or "")


nombre_propio = comun.nombre_propio  # se mantiene el nombre para quien lo importe de aquí


def describir(registro: dict[str, Any]) -> dict[str, Any]:
    """Línea, tipo, destino y sentido de un registro del shapefile."""
    nombre = limpiar(registro.get("name"))
    direccion = limpiar(registro.get("direction"))
    linea_campo = limpiar(registro.get("linename"))

    if nombre.upper().startswith("ALARGUE"):
        tipo = "alargue"
        linea = linea_campo
        hacia = nombre_propio(_PREFIJO_ALARGUE.sub("", nombre))
        if not direccion:
            direccion = "<" if "RETORNO" in nombre.upper() else ">"
    else:
        coincide = _PREFIJO_LINEA.match(nombre)
        if not coincide:
            raise ValueError(f"No se reconoce la línea en {nombre!r}")
        letra, numero, destino = coincide.groups()
        hacia = nombre_propio(destino)
        if letra == "T":
            tipo, linea = "tranvia", "Tranvía"
        elif letra == "A":
            tipo, linea = "alimentador", f"A{numero}"
        else:
            tipo, linea = "linea", numero

    return {
        "linea": linea,
        "tipo": tipo,
        "hacia": hacia,
        "sentido": {">": "ida", "<": "retorno"}.get(direccion, ""),
        "empresa": limpiar(registro.get("empresa")),
        "nombre_original": nombre,
    }


def _longitud_km(texto: str) -> float | None:
    coincide = re.search(r"[\d.]+", texto or "")
    return float(coincide.group()) if coincide else None


def parsear_shapefile(contenido_zip: bytes) -> list[dict[str, Any]]:
    """Las líneas del ZIP como entidades GeoJSON (LineString en lon/lat)."""
    archivo = zipfile.ZipFile(io.BytesIO(contenido_zip))
    nombres = {n.rsplit(".", 1)[-1].lower(): n for n in archivo.namelist()}
    faltan = {"shp", "shx", "dbf"} - set(nombres)
    if faltan:
        raise ValueError(f"Al shapefile le faltan: {', '.join(sorted(faltan))}")
    codificacion = "utf-8"
    if "cpg" in nombres:
        codificacion = (
            archivo.read(nombres["cpg"]).decode("ascii", "ignore").strip() or codificacion
        )
    prj = archivo.read(nombres["prj"]).decode("utf-8", "ignore") if "prj" in nombres else ""
    if prj and "UTM_Zone_17S" not in prj.replace(" ", "_"):
        raise ValueError("Se esperaban coordenadas UTM zona 17 Sur")

    lector = shapefile.Reader(
        shp=io.BytesIO(archivo.read(nombres["shp"])),
        shx=io.BytesIO(archivo.read(nombres["shx"])),
        dbf=io.BytesIO(archivo.read(nombres["dbf"])),
        encoding=codificacion,
    )
    entidades = []
    for forma_registro in lector.iterShapeRecords():
        registro = forma_registro.record.as_dict()
        forma = forma_registro.shape
        if len(forma.points) < 2:
            continue
        partes = [*forma.parts, len(forma.points)]
        lineas = []
        for inicio, fin in zip(partes, partes[1:], strict=False):
            puntos = [utm_a_geograficas(x, y) for x, y in forma.points[inicio:fin]]
            linea = simplificar([[round(lon, 5), round(lat, 5)] for lon, lat in puntos])
            if len(linea) >= 2:
                lineas.append(linea)
        if not lineas:
            continue
        geometria = (
            {"type": "LineString", "coordinates": lineas[0]}
            if len(lineas) == 1
            else {"type": "MultiLineString", "coordinates": lineas}
        )
        entidades.append(
            {
                "type": "Feature",
                "properties": {
                    **describir(registro),
                    "longitud_km": _longitud_km(registro.get("length")),
                },
                "geometry": geometria,
            }
        )
    if not entidades:
        raise ValueError("El shapefile no tiene líneas")
    orden_tipo = {"linea": 0, "alimentador": 1, "tranvia": 2, "alargue": 3}

    def orden(entidad: dict[str, Any]) -> tuple:
        p = entidad["properties"]
        numero = re.match(r"\d+", p["linea"])
        return (
            orden_tipo[p["tipo"]],
            int(numero.group()) if numero else 10**6,
            p["linea"],
            p["sentido"],
            p["hacia"],
        )

    entidades.sort(key=orden)
    return entidades
