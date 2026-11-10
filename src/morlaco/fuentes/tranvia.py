"""Estaciones del Tranvía de Cuenca.

La web del tranvía (tranvia.cuenca.gob.ec) consulta una API pública con las
estaciones de cada sentido, sus coordenadas y su orden. En el Centro Histórico
cada sentido tiene paradas distintas (por la Gran Colombia hacia Río Tarqui y por
la Mariscal Lamar hacia el Parque Industrial), así que una estación se identifica
por su código y sus coordenadas.

No se usan los horarios en vivo de la web: llegan por un canal no documentado.
La frecuencia publicada (cada 8 minutos entre semana, 15 los fines de semana) va
en datos/manual/transporte.json.
"""

from __future__ import annotations

import json
from typing import Any

from morlaco import red
from morlaco.comun import Resultado, decodificar, nombre_propio

PAGINA = "https://tranvia.cuenca.gob.ec/"
API = "https://tranvia.cuenca.gob.ec/apishopping/api/estaciones?filter%5Border%5D=orden%20ASC"
# NS va hacia Río Tarqui (sur-oeste) y SN hacia el Parque Industrial (nor-este).
SENTIDOS = {"NS": "Río Tarqui", "SN": "Parque Industrial"}
CAJA = (-79.10, -2.98, -78.92, -2.82)  # oeste, sur, este, norte


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
                },
                "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
            },
        )
        if SENTIDOS[sentido] not in estacion["properties"]["hacia"]:
            estacion["properties"]["hacia"].append(SENTIDOS[sentido])
    if len(estaciones) < 10:
        raise ValueError(f"La API del tranvía devolvió solo {len(estaciones)} estaciones")
    return {
        "type": "FeatureCollection",
        "metadata": {
            "titulo": "Estaciones del Tranvía de Cuenca",
            "fuente": "Tranvía de Cuenca (GAD Municipal)",
            "pagina": PAGINA,
            "datos": API,
            "nota": "hacia indica en qué sentido para el tranvía en esa estación.",
        },
        "features": list(estaciones.values()),
    }


def obtener(descargar: red.Descargador = red.descargar) -> Resultado:
    estaciones = parsear_estaciones(descargar(API))
    return Resultado(
        archivos={"buses/tranvia.geojson": estaciones},
        resumen={"estaciones": len(estaciones["features"])},
    )
