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

import heapq
import io
import json
import math
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

_M_GRADO = 111_320
_COS = math.cos(math.radians(-2.9))

IDE_WFS = "https://ide.cuenca.gob.ec/geoserver/ows"
IDE_PAGINA = f"{IDE_WFS}?service=WFS&request=GetCapabilities"
# Líneas cuyo trazado de la IDE es más nuevo que el del shapefile (comparado el 2026-11-19).
LINEAS_IDE = ("4", "27")
# El índice de calles de Morlaco (OpenStreetMap), para unir los alargues sueltos a su línea.
CALLES = "https://nezusas.github.io/morlaco/datos/calles/calles.geojson"
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


# ---------- Alargues sueltos: unirlos a su línea por las calles ----------

# Un alargue cuyo tramo empieza o termina a esta distancia de su línea ya está unido.
UNIDO_M = 150
# Más allá de esto no se une: sería inventar un recorrido.
UNION_MAXIMA_M = 3000
# Vértices de calles a menos de esto se toman como el mismo cruce (el índice de calles
# está simplificado y los cruces no siempre comparten el punto).
_CRUCE_M = 12
# Un vértice de calle a menos de esto de la línea es un lugar donde el bus puede salir de ella.
_SOBRE_LINEA_M = 25
# Lo que "cuesta" cambiar de calle: un bus sigue por la misma vía antes que zigzaguear por
# calles pequeñas para ahorrar unos metros (la 8 a Dolorosa sigue por el Camino del Tejar).
_CAMBIO_DE_CALLE_M = 400


def _metros(a: list[float], b: list[float]) -> float:
    return math.hypot((a[0] - b[0]) * _M_GRADO * _COS, (a[1] - b[1]) * _M_GRADO)


def _a_segmento(p: list[float], a: list[float], b: list[float]) -> float:
    ax, ay = (a[0] - p[0]) * _M_GRADO * _COS, (a[1] - p[1]) * _M_GRADO
    bx, by = (b[0] - p[0]) * _M_GRADO * _COS, (b[1] - p[1]) * _M_GRADO
    dx, dy = bx - ax, by - ay
    largo2 = dx * dx + dy * dy
    t = 0.0 if not largo2 else max(0.0, min(1.0, -(ax * dx + ay * dy) / largo2))
    return math.hypot(ax + t * dx, ay + t * dy)


def _a_linea(p: list[float], puntos: list[list[float]]) -> float:
    tramos = zip(puntos, puntos[1:], strict=False)
    return min((_a_segmento(p, a, b) for a, b in tramos), default=math.inf)


def _puntos(geometria: dict[str, Any]) -> list[list[float]]:
    if geometria["type"] == "LineString":
        return geometria["coordinates"]
    return [p for parte in geometria["coordinates"] for p in parte]


class _Calles:
    """El índice de calles como grafo: vértices y tramos (con el nombre de su calle), con los
    cruces unidos."""

    def __init__(self, calles: dict[str, Any]):
        self.puntos: list[list[float]] = []
        self.vecinos: list[list[tuple[int, float, str | None]]] = []
        indice: dict[tuple[float, float], int] = {}

        def nodo(p: list[float]) -> int:
            clave = (round(p[0], 5), round(p[1], 5))
            if clave not in indice:
                indice[clave] = len(self.puntos)
                self.puntos.append([clave[0], clave[1]])
                self.vecinos.append([])
            return indice[clave]

        for calle in calles.get("features", []):
            nombre = (calle.get("properties") or {}).get("nombre")
            g = calle.get("geometry") or {}
            partes = g.get("coordinates", [])
            if g.get("type") == "LineString":
                partes = [partes]
            for parte in partes:
                for a, b in zip(parte, parte[1:], strict=False):
                    i, j = nodo(a), nodo(b)
                    if i != j:
                        d = _metros(a, b)
                        self.vecinos[i].append((j, d, nombre))
                        self.vecinos[j].append((i, d, nombre))
        # Cruces: vértices muy cercanos de calles distintas.
        celda = 0.0002
        rejilla: dict[tuple[int, int], list[int]] = {}
        for i, (lon, lat) in enumerate(self.puntos):
            rejilla.setdefault((int(lon / celda), int(lat / celda)), []).append(i)
        for (cx, cy), nodos in rejilla.items():
            alrededor = [(cx + dx, cy + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
            cerca = [k for c in alrededor for k in rejilla.get(c, [])]
            for i in nodos:
                for k in cerca:
                    if i < k and (d := _metros(self.puntos[i], self.puntos[k])) <= _CRUCE_M:
                        self.vecinos[i].append((k, d, None))
                        self.vecinos[k].append((i, d, None))

    def mas_cercano(self, p: list[float], maximo: float = 60) -> int | None:
        mejor = min(range(len(self.puntos)), key=lambda i: _metros(p, self.puntos[i]), default=None)
        return mejor if mejor is not None and _metros(p, self.puntos[mejor]) <= maximo else None

    def camino(self, desde: int, metas: set[int], maximo: float) -> list[list[float]] | None:
        """El camino por las calles desde un vértice hasta cualquiera de las metas que menos
        cuesta: sus metros más _CAMBIO_DE_CALLE_M por cada vez que cambia de calle. Su largo
        real no pasa de `maximo`."""
        Estado = tuple[int, str | None]
        inicio: Estado = (desde, None)
        costo: dict[Estado, float] = {inicio: 0.0}
        previo: dict[Estado, Estado] = {}
        cola: list[tuple[float, float, int, str]] = [(0.0, 0.0, desde, "")]
        while cola:
            c, largo, i, calle = heapq.heappop(cola)
            actual: Estado = (i, calle or None)
            if c > costo.get(actual, math.inf) or largo > maximo:
                continue
            if i in metas:
                camino = [actual]
                while camino[-1] in previo:
                    camino.append(previo[camino[-1]])
                return [self.puntos[k] for k, _ in camino]  # de la meta (la línea) al inicio
            for j, w, nombre in self.vecinos[i]:
                cambia = bool(calle and nombre and nombre != calle)
                siguiente: Estado = (j, nombre or calle or None)
                nuevo = c + w + (_CAMBIO_DE_CALLE_M if cambia else 0)
                if nuevo < costo.get(siguiente, math.inf):
                    costo[siguiente] = nuevo
                    previo[siguiente] = actual
                    heapq.heappush(cola, (nuevo, largo + w, j, siguiente[1] or ""))
        return None


def unir_alargues(
    entidades: list[dict[str, Any]], calles: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[str]]:
    """Une a su línea por las calles los alargues que no la tocan (el camino más corto que
    menos cambia de calle).

    En el shapefile de 2022 algunos alargues empiezan lejos de su línea: el de la 8 a
    Dolorosa empieza en De los Ladrilleros, y la línea baja del Camino del Tejar a la
    Ordóñez Lasso casi 900 m antes; el bus de Dolorosa sigue por el Camino del Tejar. Aquí
    se completa ese tramo por las calles (como mucho UNION_MAXIMA_M) y se anota en la
    propiedad "union_calles_m". Devuelve las entidades y la lista de alargues unidos."""
    grafo: _Calles | None = None
    principales: dict[str, list[list[list[float]]]] = {}
    for f in entidades:
        if f["properties"]["tipo"] != "alargue":
            principales.setdefault(f["properties"]["linea"], []).append(_puntos(f["geometry"]))
    salida, unidos = [], []
    for f in entidades:
        p = f["properties"]
        lineas = principales.get(p["linea"], [])
        if p["tipo"] != "alargue" or not lineas:
            salida.append(f)
            continue
        puntos = _puntos(f["geometry"])
        a_linea = [min(_a_linea(e, linea) for linea in lineas) for e in (puntos[0], puntos[-1])]
        if min(a_linea) <= UNIDO_M:
            salida.append(f)
            continue
        grafo = grafo or _Calles(calles)
        # Se une por el extremo más cercano a la línea.
        al_inicio = a_linea[0] <= a_linea[1]
        extremo = puntos[0] if al_inicio else puntos[-1]
        desde = grafo.mas_cercano(extremo)
        metas = {
            i
            for i, q in enumerate(grafo.puntos)
            if min(_a_linea(q, linea) for linea in lineas) <= _SOBRE_LINEA_M
        }
        camino = grafo.camino(desde, metas, UNION_MAXIMA_M) if desde is not None and metas else None
        if not camino:
            salida.append(f)
            continue
        union = camino if al_inicio else camino[::-1]
        coords = [*union, *puntos] if al_inicio else [*puntos, *union]
        largo = sum(_metros(a, b) for a, b in zip(union, union[1:], strict=False))
        salida.append(
            {
                **f,
                "properties": {**p, "union_calles_m": round(largo)},
                "geometry": {"type": "LineString", "coordinates": coords},
            }
        )
        unidos.append(f"{p['linea']} {p['sentido']} {p['hacia']} ({round(largo)} m)")
    return salida, unidos
