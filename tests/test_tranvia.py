import json

import pytest

from morlaco.fuentes import tranvia


def fila(codigo, sentido, lat, lon, nombre, orden=None):
    return {
        "orden": orden,
        "id_est": codigo,
        "est_sentido": sentido,
        "est_latitud": lat,
        "est_longitud": lon,
        "nombre": nombre,
    }


FILAS = [
    fila("RTA", "SN", -2.91965, -79.03882, "Río Tarqui"),
    fila("RTA", "NS", -2.91965, -79.039, "Río Tarqui"),
    fila("ESA", "SN", -2.9144, -79.0375, "EL Salado", 2),
    fila("ESA", "NS", -2.9144, -79.0375, "EL Salado", 18),
    fila("SAN", "NS", -2.89481, -78.99994, "Gaspar Sangurima"),
    fila("HMI", "SN", -2.8964, -79.00233, "Hermano Miguel"),
    fila("OLA", "NS", -2.89173, -79.02465, "Ordonez Lazo"),
    fila("PAT", "PA", -2.9034, -79.0265, "Patio Taller"),
] + [fila(f"X{i}", "NS", -2.89 - i / 1000, -79.0, f"Estación {i}") for i in range(6)]


def test_parsear_estaciones():
    datos = tranvia.parsear_estaciones(json.dumps(FILAS).encode())
    por_id = {}
    for f in datos["features"]:
        por_id.setdefault(f["properties"]["id"], []).append(f)
    assert "PAT" not in por_id  # el patio taller no es una estación
    # Misma estación y mismo lugar en los dos sentidos: una sola, con los dos destinos.
    (salado,) = por_id["ESA"]
    assert salado["properties"] == {
        "id": "ESA",
        "nombre": "El Salado",
        "hacia": ["Parque Industrial", "Río Tarqui"],
        # Su lugar en el recorrido de cada sentido, para unir las estaciones en orden.
        "orden": {"Parque Industrial": 2, "Río Tarqui": 18},
    }
    assert salado["geometry"]["coordinates"] == [-79.0375, -2.9144]
    # Río Tarqui tiene un andén por sentido, a unos metros: dos puntos.
    assert len(por_id["RTA"]) == 2
    assert por_id["HMI"][0]["properties"]["hacia"] == ["Parque Industrial"]
    assert por_id["HMI"][0]["properties"]["orden"] == {}  # la API no lo trajo
    assert por_id["OLA"][0]["properties"]["nombre"] == "Ordóñez Lazo"


def test_parsear_estaciones_rechaza_respuestas_raras():
    with pytest.raises(ValueError):
        tranvia.parsear_estaciones(b'{"error": "x"}')
    with pytest.raises(ValueError):
        tranvia.parsear_estaciones(json.dumps(FILAS[:3]).encode())


def riel(*puntos, **etiquetas):
    return {
        "type": "way",
        "tags": {"railway": "tram", **etiquetas},
        "geometry": [{"lon": lon, "lat": lat} for lon, lat in puntos],
    }


# Dos vías paralelas, una por sentido (separadas unos 11 m), y un desvío al patio taller.
RIELES = json.dumps(
    {
        "elements": [
            riel((-79.03, -2.9), (-79.02, -2.9), (-79.02, -2.89), (-79.01, -2.89)),  # hacia el este
            riel((-79.01, -2.8901), (-79.02, -2.8901), (-79.0201, -2.9001), (-79.03, -2.9001)),
            riel((-79.02, -2.9), (-79.02, -2.95), service="yard"),
        ]
    }
).encode()


def estacion(codigo, lon, lat, **orden):
    return {
        "type": "Feature",
        "properties": {"id": codigo, "nombre": codigo, "hacia": list(orden), "orden": orden},
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
    }


ESTACIONES = {
    "features": [
        estacion("A", -79.03, -2.90005, **{"Parque Industrial": 1, "Río Tarqui": 2}),
        estacion("B", -79.01, -2.89005, **{"Parque Industrial": 2, "Río Tarqui": 1}),
    ]
}


def test_recorrido_sigue_los_rieles_por_la_via_de_cada_sentido():
    datos = tranvia.parsear_recorrido(ESTACIONES, RIELES)
    ida, retorno = datos["features"]
    assert (ida["properties"]["sentido"], ida["properties"]["hacia"]) == (
        "ida",
        "Parque Industrial",
    )
    assert retorno["properties"]["hacia"] == "Río Tarqui"
    # Dobla en la esquina en vez de cortar en diagonal: unos 3,3 km, no los 2,5 km en línea recta.
    assert 3.2 < ida["properties"]["longitud_km"] < 3.4
    assert [-79.02, -2.9] in ida["geometry"]["coordinates"]
    # Cada sentido va por su vía (la del retorno está 11 m al sur) y no entra al patio taller.
    assert all(lat in (-2.9, -2.89) for _, lat in ida["geometry"]["coordinates"])
    assert all(lat in (-2.8901, -2.9001) for _, lat in retorno["geometry"]["coordinates"])
    assert retorno["geometry"]["coordinates"][0] == [-79.01, -2.8901]


def test_recorrido_falla_si_una_estacion_no_tiene_riel_cerca():
    lejos = {
        "features": [
            *ESTACIONES["features"][:1],
            estacion("C", -78.95, -2.85, **{"Parque Industrial": 2, "Río Tarqui": 1}),
        ]
    }  # noqa: E501
    with pytest.raises(ValueError):
        tranvia.parsear_recorrido(lejos, RIELES)


def test_obtener_publica_las_estaciones_aunque_falten_los_rieles():
    def sin_rieles(url):
        if "overpass" in url:
            raise OSError("sin respuesta")
        return json.dumps(FILAS).encode()

    resultado = tranvia.obtener(sin_rieles)
    assert list(resultado.archivos) == ["buses/tranvia.geojson"]
