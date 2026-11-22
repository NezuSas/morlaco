"""Índice de calles de Cuenca, de OpenStreetMap.

Sirve para buscar direcciones dentro de la página sin depender de un servicio
externo: en Cuenca las direcciones se dan como intersecciones ("Av. Solano y
Remigio Crespo"), y para encontrarlas hace falta la geometría de cada calle.

Se descargan con la API Overpass todas las vías con nombre dentro de la ciudad,
se agrupan por nombre y se simplifica su trazado (unos pocos metros de
tolerancia) para que el archivo pese poco.

En la misma consulta vienen las parroquias, los barrios, los sectores y las
urbanizaciones con nombre: con ellos se puede buscar "Totoracocha" y saber si un
corte de agua anunciado por sectores cae cerca. De cada uno se guarda un punto
(el del lugar, o el centro de su área), no su contorno.

Y los hospitales y centros de salud: el hospital con emergencias y el centro de salud
público más cercanos a cada calle. Y todas las farmacias: ARCSA solo publica las de turno
(las que abren de noche), pero de día casi todas atienden.
"""

from __future__ import annotations

import json
import math
import re
from typing import Any
from urllib.parse import urlencode

from morlaco import red
from morlaco.comun import Resultado, decodificar, limpiar

OVERPASS = "https://overpass-api.de/api/interpreter"
# Sur, oeste, norte, este: la ciudad de Cuenca y sus alrededores inmediatos.
CAJA = (-2.98, -79.10, -2.82, -78.92)
_CAJA_OVERPASS = f"({CAJA[0]},{CAJA[1]},{CAJA[2]},{CAJA[3]})"
# Lo que en OpenStreetMap es un barrio, un sector o un poblado.
LUGARES = ("town", "suburb", "village", "quarter", "neighbourhood", "hamlet", "locality")
# Con el mismo nombre dos veces, se queda el primero de esta lista. "parroquia" son los límites
# administrativos (las parroquias urbanas y rurales) y "urbanizacion", las áreas residenciales
# con nombre (ciudadelas, urbanizaciones).
ORDEN_LUGARES = (
    "parroquia",
    "town",
    "suburb",
    "village",
    "quarter",
    "neighbourhood",
    "urbanizacion",
    "hamlet",
    "locality",
)
_CONSULTA_LUGARES = (
    f'node["place"~"^({"|".join(LUGARES)})$"]["name"]{_CAJA_OVERPASS};'
    f'relation["boundary"="administrative"]["admin_level"~"^(8|9)$"]["name"]{_CAJA_OVERPASS};'
    f'way["landuse"="residential"]["name"]{_CAJA_OVERPASS};'
)
_CONSULTA_SALUD = (
    f'nwr["amenity"="hospital"]{_CAJA_OVERPASS};'
    f'nwr["amenity"="clinic"]["name"~"centro de salud|subcentro|hospital",i]{_CAJA_OVERPASS};'
)
_CONSULTA_FARMACIAS = (
    f'nwr["amenity"="pharmacy"]{_CAJA_OVERPASS};nwr["healthcare"="pharmacy"]{_CAJA_OVERPASS};'
)
CONSULTA = (
    "[out:json][timeout:150];"
    f'way["highway"]["name"]{_CAJA_OVERPASS};'
    "out tags geom;"
    f"({_CONSULTA_LUGARES});"
    "out tags center;"
    f"({_CONSULTA_SALUD});"
    "out tags center;"
    f"({_CONSULTA_FARMACIAS});"
    "out tags center;"
)
# Un centro de salud público, por su nombre; y lo que no es atención general (dentistas,
# rehabilitación, laboratorios…), que no sirve como "dónde voy si me enfermo".
_CENTRO_SALUD = re.compile(r"centro\s+de\s+salud|sub\s*centro", re.IGNORECASE)
_NO_GENERAL = re.compile(
    r"dental|dent\b|rehabilit|fisio|adicci|psiqui|narc[oó]tic|c[aá]ncer|solca|di[aá]lisis|"
    r"emociones|adn\b|redux|reposo|inspi|laborator|ambulancia|cruz roja|crie|\bidi\b",
    re.IGNORECASE,
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


def parsear_barrios(contenido: bytes) -> dict[str, Any]:
    """Los barrios, sectores y poblados con nombre: un punto por cada uno."""
    elementos = json.loads(decodificar(contenido)).get("elements", [])
    barrios: dict[str, dict[str, Any]] = {}
    for elemento in elementos:
        etiquetas = elemento.get("tags", {})
        if etiquetas.get("boundary") == "administrative":
            tipo = "parroquia"
        elif etiquetas.get("landuse") == "residential":
            tipo = "urbanizacion"
        else:
            tipo = etiquetas.get("place")
        nombre = limpiar(etiquetas.get("name"))
        # Un nodo trae su punto; un área, su centro.
        punto = elemento if elemento.get("type") == "node" else elemento.get("center")
        if tipo not in ORDEN_LUGARES or not nombre or not punto or "highway" in etiquetas:
            continue
        lat, lon = punto["lat"], punto["lon"]
        # El centro de una parroquia rural grande puede caer lejos de la ciudad.
        if not (CAJA[0] <= lat <= CAJA[2] and CAJA[1] <= lon <= CAJA[3]):
            continue
        # Con el mismo nombre dos veces, se queda el más importante.
        anterior = barrios.get(nombre.lower())
        if anterior and ORDEN_LUGARES.index(anterior["tipo"]) <= ORDEN_LUGARES.index(tipo):
            continue
        barrios[nombre.lower()] = {
            "nombre": nombre,
            "tipo": tipo,
            "lat": round(lat, 5),
            "lon": round(lon, 5),
        }
    return {
        "metadata": {
            "titulo": "Barrios, sectores y poblados de Cuenca",
            "fuente": "OpenStreetMap, vía la API Overpass",
            "atribucion": "© colaboradores de OpenStreetMap",
            "licencia": "Open Database License (ODbL) 1.0",
            "nota": "Un punto por lugar (no su contorno). tipo es parroquia (límite "
            "administrativo), urbanizacion (área residencial con nombre) o la etiqueta place de "
            "OpenStreetMap: suburb, neighbourhood, quarter, village, hamlet, locality o town.",
        },
        "barrios": sorted(barrios.values(), key=lambda b: b["nombre"]),
    }


def parsear_salud(contenido: bytes) -> dict[str, Any]:
    """Hospitales y centros de salud, un punto por cada uno, sin repetidos.

    tipo es "emergencias" (un hospital que OpenStreetMap marca con emergencias),
    "centro_salud" (un centro o subcentro de salud) u "hospital" (los demás hospitales y
    clínicas de atención general)."""
    elementos = json.loads(decodificar(contenido)).get("elements", [])
    lugares: dict[str, dict[str, Any]] = {}
    orden = ("emergencias", "centro_salud", "hospital")
    for elemento in elementos:
        etiquetas = elemento.get("tags", {})
        nombre = limpiar(etiquetas.get("name"))
        punto = elemento if elemento.get("type") == "node" else elemento.get("center")
        if etiquetas.get("amenity") not in {"hospital", "clinic"} or not nombre or not punto:
            continue
        if _NO_GENERAL.search(nombre):
            continue
        if _CENTRO_SALUD.search(nombre):
            tipo = "centro_salud"
        elif (
            etiquetas.get("emergency") == "yes"
            and etiquetas.get("amenity") == "hospital"
            # Los de las fuerzas armadas y la policía atienden sobre todo a los suyos.
            and not re.search(r"militar|polic[ií]a", nombre, re.IGNORECASE)
        ):
            tipo = "emergencias"
        elif re.search(r"hospital|cl[ií]nica", nombre, re.IGNORECASE):
            tipo = "hospital"
        else:
            continue
        anterior = lugares.get(nombre.lower())
        if anterior and orden.index(anterior["tipo"]) <= orden.index(tipo):
            continue
        telefono = etiquetas.get("phone") or etiquetas.get("contact:phone")
        lugares[nombre.lower()] = {
            "nombre": nombre,
            "tipo": tipo,
            "lat": round(punto["lat"], 5),
            "lon": round(punto["lon"], 5),
            "telefono": limpiar(telefono.split(";")[0]) if telefono else None,
        }
    return {
        "metadata": {
            "titulo": "Hospitales y centros de salud de Cuenca",
            "fuente": "OpenStreetMap, vía la API Overpass",
            "atribucion": "© colaboradores de OpenStreetMap",
            "licencia": "Open Database License (ODbL) 1.0",
            "nota": "tipo: emergencias (hospital marcado con servicio de emergencias), "
            "centro_salud (centro o subcentro de salud) u hospital (otros hospitales y clínicas "
            "de atención general). Sin dentistas, rehabilitación ni laboratorios. Los datos "
            "son de la comunidad: conviene confirmar antes de ir.",
        },
        "lugares": sorted(lugares.values(), key=lambda lugar: lugar["nombre"]),
    }


def _entre(a: dict[str, Any], b: dict[str, Any]) -> float:
    """Metros entre dos puntos {lat, lon} cercanos."""
    dy = (a["lat"] - b["lat"]) * _METROS_POR_GRADO
    dx = (a["lon"] - b["lon"]) * _METROS_POR_GRADO * math.cos(math.radians(a["lat"]))
    return math.hypot(dx, dy)


def parsear_farmacias(contenido: bytes) -> dict[str, Any]:
    """Todas las farmacias que OpenStreetMap tiene en Cuenca, un punto por cada una.

    Muchas comparten nombre (las cadenas), así que una se descarta solo si es la misma vista
    dos veces: el mismo nombre a menos de 25 m (el local y su edificio), o una sin nombre a
    menos de 40 m de otra que sí lo tiene. `horario` es la etiqueta opening_hours tal cual (la
    página la interpreta), o null."""
    elementos = json.loads(decodificar(contenido)).get("elements", [])
    candidatas: list[dict[str, Any]] = []
    for elemento in elementos:
        etiquetas = elemento.get("tags", {})
        punto = elemento if elemento.get("type") == "node" else elemento.get("center")
        es_farmacia = "pharmacy" in {etiquetas.get("amenity"), etiquetas.get("healthcare")}
        if not es_farmacia or not punto:
            continue
        lat, lon = round(punto["lat"], 5), round(punto["lon"], 5)
        if not (CAJA[0] <= lat <= CAJA[2] and CAJA[1] <= lon <= CAJA[3]):
            continue
        nombre = limpiar(etiquetas.get("name") or etiquetas.get("brand")) or None
        telefono = etiquetas.get("phone") or etiquetas.get("contact:phone")
        calle = limpiar(etiquetas.get("addr:street"))
        numero = limpiar(etiquetas.get("addr:housenumber"))
        candidatas.append(
            {
                "osm": f"{elemento.get('type', 'node')}/{elemento.get('id')}",
                "nombre": nombre,
                "lat": lat,
                "lon": lon,
                "direccion": " ".join(filter(None, [calle, numero])) or None,
                "telefono": limpiar(telefono.split(";")[0]) if telefono else None,
                "horario": limpiar(etiquetas.get("opening_hours")) or None,
            }
        )
    # Primero las que tienen más datos: de dos repetidas, queda la más completa.
    candidatas.sort(key=lambda f: -sum(v is not None for v in f.values()))
    farmacias: list[dict[str, Any]] = []
    for f in candidatas:
        nombre = (f["nombre"] or "").lower()
        repetida = any(
            (nombre and (otra["nombre"] or "").lower() == nombre and _entre(otra, f) < 25)
            or (not nombre and _entre(otra, f) < 40)
            for otra in farmacias
        )
        if not repetida:
            farmacias.append(f)
    return {
        "metadata": {
            "titulo": "Farmacias de Cuenca",
            "fuente": "OpenStreetMap, vía la API Overpass",
            "atribucion": "© colaboradores de OpenStreetMap",
            "licencia": "Open Database License (ODbL) 1.0",
            "nota": "Todas las farmacias que OpenStreetMap tiene en la ciudad, no solo las de "
            "turno. horario es la etiqueta opening_hours de OpenStreetMap tal cual (null si no "
            'la tiene; "24/7" es abierta siempre). nombre es null si no lo tiene. Los datos son '
            "de la comunidad y pueden faltar farmacias: conviene llamar antes de ir.",
        },
        "farmacias": sorted(farmacias, key=lambda f: (f["nombre"] or "~", f["lat"], f["lon"])),
    }


def obtener(descargar: red.Descargador = red.descargar) -> Resultado:
    contenido = descargar(f"{OVERPASS}?{urlencode({'data': CONSULTA})}")
    calles = parsear_overpass(contenido)
    barrios = parsear_barrios(contenido)
    salud = parsear_salud(contenido)
    farmacias = parsear_farmacias(contenido)
    return Resultado(
        archivos={
            "calles/calles.geojson": calles,
            "ciudad/barrios.json": barrios,
            "ciudad/salud.json": salud,
            "ciudad/farmacias.json": farmacias,
        },
        resumen={
            "calles": len(calles["features"]),
            "tramos": sum(len(f["geometry"]["coordinates"]) for f in calles["features"]),
            "barrios": len(barrios["barrios"]),
            "salud": len(salud["lugares"]),
            "farmacias": len(farmacias["farmacias"]),
        },
    )
