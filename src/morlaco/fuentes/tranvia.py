"""Estaciones del Tranvía de Cuenca.

La web del tranvía (tranvia.cuenca.gob.ec) consulta una API pública con las
estaciones de cada sentido, sus coordenadas y su orden. En el Centro Histórico
cada sentido tiene paradas distintas (por la Gran Colombia hacia Río Tarqui y por
la Mariscal Lamar hacia el Parque Industrial), así que una estación se identifica
por su código y sus coordenadas.

El orden de cada sentido se guarda también: con él se arma el recorrido (el trazado
que publica el municipio está incompleto). El recorrido sigue los rieles de
OpenStreetMap de estación en estación, por la vía de cada sentido; si esa descarga
falla, la página une las estaciones en línea recta.

No se usan los horarios en vivo de la web: llegan por un canal no documentado.
La frecuencia publicada (cada 8 minutos entre semana, 15 los fines de semana) va
en datos/manual/transporte.json.
"""

from __future__ import annotations

import heapq
import json
import math
from typing import Any
from urllib.parse import urlencode

from morlaco import red
from morlaco.comun import Resultado, decodificar, nombre_propio
from morlaco.fuentes.calles import simplificar

PAGINA = "https://tranvia.cuenca.gob.ec/"
API = "https://tranvia.cuenca.gob.ec/apishopping/api/estaciones?filter%5Border%5D=orden%20ASC"
# NS va hacia Río Tarqui (sur-oeste) y SN hacia el Parque Industrial (nor-este).
SENTIDOS = {"NS": "Río Tarqui", "SN": "Parque Industrial"}
CAJA = (-79.10, -2.98, -78.92, -2.82)  # oeste, sur, este, norte
OVERPASS = "https://overpass-api.de/api/interpreter"
CONSULTA_RIELES = (
    "[out:json][timeout:90];"
    f'way["railway"="tram"]({CAJA[1]},{CAJA[0]},{CAJA[3]},{CAJA[2]});'
    "out tags geom;"
)
# Ir a contramano por un riel cuesta esto: solo se hace si no hay otro camino.
_CONTRAMANO = 6
# Los nodos de riel a esta distancia de una estación son candidatos a ser su andén.
_RADIO_ANDEN_M = 35


def parsear_estaciones(contenido: bytes) -> dict[str, Any]:
    """Las estaciones como GeoJSON, una por código y lugar, con los sentidos que paran allí."""
    filas = json.loads(decodificar(contenido))
    if not isinstance(filas, list):
        raise ValueError("La API del tranvía no devolvió una lista")
    estaciones: dict[tuple[str, float, float], dict[str, Any]] = {}
    for fila in filas:
        sentido = fila.get("est_sentido")
        if sentido not in SENTIDOS:  # "PA" es el patio taller
            continue
        lat, lon = float(fila["est_latitud"]), float(fila["est_longitud"])
        if not (CAJA[0] <= lon <= CAJA[2] and CAJA[1] <= lat <= CAJA[3]):
            continue
        clave = (fila["id_est"], round(lat, 4), round(lon, 4))
        estacion = estaciones.setdefault(
            clave,
            {
                "type": "Feature",
                "properties": {
                    "id": fila["id_est"],
                    "nombre": nombre_propio(fila.get("nombre") or fila["id_est"]),
                    "hacia": [],
                    "orden": {},
                },
                "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
            },
        )
        if SENTIDOS[sentido] not in estacion["properties"]["hacia"]:
            estacion["properties"]["hacia"].append(SENTIDOS[sentido])
        if isinstance(fila.get("orden"), int):
            estacion["properties"]["orden"][SENTIDOS[sentido]] = fila["orden"]
    if len(estaciones) < 10:
        raise ValueError(f"La API del tranvía devolvió solo {len(estaciones)} estaciones")
    return {
        "type": "FeatureCollection",
        "metadata": {
            "titulo": "Estaciones del Tranvía de Cuenca",
            "fuente": "Tranvía de Cuenca (GAD Municipal)",
            "pagina": PAGINA,
            "datos": API,
            "nota": "hacia indica en qué sentido para el tranvía en esa estación; orden, su "
            "lugar en el recorrido de cada sentido (1 es la primera).",
        },
        "features": list(estaciones.values()),
    }


def _metros(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(
        (b[0] - a[0]) * math.cos(math.radians(a[1])) * 111_320, (b[1] - a[1]) * 110_540
    )


def _grafo_de_rieles(contenido: bytes) -> dict[tuple, list[tuple[tuple, float]]]:
    """Los rieles como grafo dirigido: cada vía se recorre en el sentido en que está dibujada."""
    grafo: dict[tuple, list[tuple[tuple, float]]] = {}
    for via in json.loads(decodificar(contenido)).get("elements", []):
        if via.get("tags", {}).get("service") in {"yard", "siding"}:  # el patio taller
            continue
        puntos = [(round(p["lon"], 6), round(p["lat"], 6)) for p in via.get("geometry") or []]
        for a, b in zip(puntos, puntos[1:], strict=False):
            metros = _metros(a, b)
            grafo.setdefault(a, []).append((b, metros))
            grafo.setdefault(b, []).append((a, metros * _CONTRAMANO))
    return grafo


def _desde(grafo: dict, origen: tuple) -> tuple[dict, dict]:
    """El coste mínimo desde `origen` a cada nodo, y por dónde se llega (Dijkstra)."""
    costes = {origen: 0.0}
    previo: dict[tuple, tuple] = {}
    cola = [(0.0, origen)]
    while cola:
        coste, nodo = heapq.heappop(cola)
        if coste > costes.get(nodo, math.inf):
            continue
        for vecino, metros in grafo[nodo]:
            if coste + metros < costes.get(vecino, math.inf):
                costes[vecino] = coste + metros
                previo[vecino] = nodo
                heapq.heappush(cola, (coste + metros, vecino))
    return costes, previo


def recorrido_por_rieles(paradas: list[tuple[float, float]], grafo: dict) -> list[list[float]]:
    """El camino por los rieles que pasa por las estaciones en orden.

    Cada estación tiene dos vías al lado (una por sentido): se prueban los nodos cercanos
    de las dos y se queda la cadena más corta de punta a punta, que es la del sentido
    correcto. Devuelve [] si alguna estación queda sin riel o sin camino."""
    nodos = list(grafo)

    def candidatos(punto: tuple[float, float]) -> list[tuple]:
        cerca = sorted(
            (n for n in nodos if _metros(n, punto) <= _RADIO_ANDEN_M),
            key=lambda n: _metros(n, punto),
        )
        return cerca[:8]

    # Para cada candidato de cada estación: (coste acumulado, candidato anterior, camino).
    filas: list[dict[tuple, tuple]] = [
        {c: (_metros(c, paradas[0]) * 3, None, [c]) for c in candidatos(paradas[0])}
    ]
    for punto in paradas[1:]:
        fila: dict[tuple, tuple] = {}
        for anterior, (coste_anterior, _, _) in filas[-1].items():
            costes, previo = _desde(grafo, anterior)
            for candidato in candidatos(punto):
                if candidato not in costes:
                    continue
                total = coste_anterior + costes[candidato] + _metros(candidato, punto) * 3
                if candidato not in fila or total < fila[candidato][0]:
                    camino = [candidato]
                    while camino[-1] != anterior:
                        camino.append(previo[camino[-1]])
                    fila[candidato] = (total, anterior, camino[::-1])
        if not fila:
            return []
        filas.append(fila)
    if not filas[0]:
        return []
    nodo = min(filas[-1], key=lambda c: filas[-1][c][0])
    tramos = []
    for fila in reversed(filas[1:]):
        _, anterior, camino = fila[nodo]
        tramos.append(camino)
        nodo = anterior
    linea = [list(tramos[-1][0])]
    for camino in reversed(tramos):
        linea.extend(list(p) for p in camino[1:])
    return linea


def parsear_recorrido(estaciones: dict[str, Any], rieles: bytes) -> dict[str, Any]:
    """El recorrido de cada sentido por los rieles, como dos LineString."""
    grafo = _grafo_de_rieles(rieles)
    trazos = []
    for sentido, hacia in (("ida", "Parque Industrial"), ("retorno", "Río Tarqui")):
        en_orden = sorted(
            (e for e in estaciones["features"] if hacia in e["properties"]["orden"]),
            key=lambda e: e["properties"]["orden"][hacia],
        )
        linea = recorrido_por_rieles([tuple(e["geometry"]["coordinates"]) for e in en_orden], grafo)
        if len(linea) < 2:
            raise ValueError(f"No se pudo armar el recorrido del tranvía hacia {hacia}")
        metros = sum(_metros(tuple(a), tuple(b)) for a, b in zip(linea, linea[1:], strict=False))
        trazos.append(
            {
                "type": "Feature",
                "properties": {
                    "linea": "Tranvía",
                    "tipo": "tranvia",
                    "sentido": sentido,
                    "hacia": hacia,
                    "longitud_km": round(metros / 1000, 3),
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [round(lon, 5), round(lat, 5)] for lon, lat in simplificar(linea, 2.0)
                    ],
                },
            }
        )
    return {
        "type": "FeatureCollection",
        "metadata": {
            "titulo": "Recorrido del Tranvía de Cuenca",
            "fuente": "OpenStreetMap (rieles) y Tranvía de Cuenca (orden de las estaciones)",
            "atribucion": "© colaboradores de OpenStreetMap",
            "licencia": "Open Database License (ODbL) 1.0",
            "nota": "El camino por los rieles que une las estaciones de cada sentido, en orden.",
        },
        "features": trazos,
    }


def obtener(descargar: red.Descargador = red.descargar) -> Resultado:
    estaciones = parsear_estaciones(descargar(API))
    archivos: dict[str, Any] = {"buses/tranvia.geojson": estaciones}
    resumen = {"estaciones": len(estaciones["features"])}
    # El recorrido es un extra: si OpenStreetMap no responde, las estaciones se publican igual
    # y el recorrido anterior se queda como estaba.
    try:
        rieles = descargar(f"{OVERPASS}?{urlencode({'data': CONSULTA_RIELES})}")
        recorrido = parsear_recorrido(estaciones, rieles)
        archivos["buses/tranvia-recorrido.geojson"] = recorrido
        resumen["recorrido_km"] = sum(f["properties"]["longitud_km"] for f in recorrido["features"])
    except Exception:  # noqa: BLE001 (cualquier fallo de red o de datos: no es esencial)
        pass
    return Resultado(archivos=archivos, resumen=resumen)
