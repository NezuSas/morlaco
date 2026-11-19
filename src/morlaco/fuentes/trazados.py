"""Trazado de las líneas de bus y del tranvía, del portal Cuenca en Datos.

El conjunto "Rutas de transporte público" incluye un shapefile (ZIP) con el
recorrido de cada línea en cada sentido, en coordenadas UTM 17 Sur. Además de
las líneas, trae los "alargues" (prolongaciones de algunas líneas hasta barrios
más lejanos), los alimentadores y el tranvía.

Aviso: el último shapefile publicado es de septiembre de 2022; algunas líneas
han cambiado desde entonces. Los horarios y las frecuencias salen del CSV de
rutas, que sí está más al día.

Para las líneas de LINEAS_IDE el trazado se toma del servicio WFS de la IDE del
Municipio, que publica la misma capa con esas líneas ya corregidas: la línea 4 de
la IDE pasa por el Mall del Río y el IESS, como el recorrido de abril de 2026, y la
del shapefile todavía pasa por la Feria Libre; la 27 de la IDE sube por la Tarqui
hasta la Pío Bravo ("Tarqui y Sangurima" en el recorrido), y la del shapefile se
desvía por la Estévez de Toral.
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from typing import Any
from urllib.parse import urlencode

import shapefile

from morlaco import comun
from morlaco.comun import limpiar
from morlaco.fuentes.calles import simplificar
from morlaco.geo import utm_a_geograficas

_PREFIJO_ALARGUE = re.compile(r"^ALARGUE\s+(?:IDA?N?|RETORNO|ID)?\s*", re.IGNORECASE)
_PREFIJO_LINEA = re.compile(r"^(L|A|T)(\d+[A-Z]?)\s+(.*)$")

IDE_WFS = "https://ide.cuenca.gob.ec/geoserver/ows"
IDE_PAGINA = f"{IDE_WFS}?service=WFS&request=GetCapabilities"
# Líneas cuyo trazado de la IDE es más nuevo que el del shapefile (comparado el 2026-11-19).
LINEAS_IDE = ("4", "27")
_ORDEN_TIPO = {"linea": 0, "alimentador": 1, "tranvia": 2, "alargue": 3}


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
        cortes = [*forma.parts, len(forma.points)]
        geometria = _geometria(
            [
                [utm_a_geograficas(x, y) for x, y in forma.points[inicio:fin]]
                for inicio, fin in zip(cortes, cortes[1:], strict=False)
            ]
        )
        if geometria is None:
            continue
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
    return ordenar(entidades)


def _orden(entidad: dict[str, Any]) -> tuple:
    p = entidad["properties"]
    numero = re.match(r"\d+", p["linea"])
    return (
        _ORDEN_TIPO[p["tipo"]],
        int(numero.group()) if numero else 10**6,
        p["linea"],
        p["sentido"],
        p["hacia"],
    )


def ordenar(entidades: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(entidades, key=_orden)


def _geometria(partes: list[list[list[float]]]) -> dict[str, Any] | None:
    lineas = [simplificar([[round(lon, 5), round(lat, 5)] for lon, lat, *_ in p]) for p in partes]
    lineas = [linea for linea in lineas if len(linea) >= 2]
    if not lineas:
        return None
    if len(lineas) == 1:
        return {"type": "LineString", "coordinates": lineas[0]}
    return {"type": "MultiLineString", "coordinates": lineas}


def url_ide(linea: str) -> str:
    """La capa de una línea en la IDE, como GeoJSON en lon/lat."""
    parametros = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": f"ide:dmt_linea{linea}",
        "outputFormat": "application/json",
        "srsName": "EPSG:4326",
    }
    return f"{IDE_WFS}?{urlencode(parametros)}"


def parsear_ide(contenido: bytes) -> list[dict[str, Any]]:
    """Las entidades de una capa `ide:dmt_lineaN`, con las mismas propiedades que el shapefile."""
    datos = json.loads(contenido)
    entidades = []
    for f in datos.get("features", []):
        g = f.get("geometry") or {}
        partes = g.get("coordinates") or []
        partes = partes if g.get("type") == "MultiLineString" else [partes]
        geometria = _geometria(partes)
        if geometria is None:
            continue
        registro = f.get("properties") or {}
        entidades.append(
            {
                "type": "Feature",
                "properties": {
                    **describir(registro),
                    "longitud_km": _longitud_km(registro.get("length")),
                    "fuente": "ide",
                },
                "geometry": geometria,
            }
        )
    return entidades


def reemplazar_lineas(
    entidades: list[dict[str, Any]], nuevas: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Cambia, en cada línea que traen `nuevas`, sus trazados principales (ida y retorno) por
    los nuevos. Los alargues se quedan. Falla si `nuevas` no trae los dos sentidos."""
    lineas = {f["properties"]["linea"] for f in nuevas if f["properties"]["tipo"] == "linea"}
    for linea in lineas:
        sentidos = {
            f["properties"]["sentido"]
            for f in nuevas
            if f["properties"]["linea"] == linea and f["properties"]["tipo"] == "linea"
        }
        if sentidos != {"ida", "retorno"}:
            raise ValueError(f"La IDE no trae la ida y el retorno de la línea {linea}")
    quedan = [
        f
        for f in entidades
        if not (f["properties"]["tipo"] == "linea" and f["properties"]["linea"] in lineas)
    ]
    return ordenar([*quedan, *(f for f in nuevas if f["properties"]["linea"] in lineas)])
