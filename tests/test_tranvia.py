import json

import pytest

from morlaco.fuentes import tranvia


def fila(codigo, sentido, lat, lon, nombre):
    return {
        "id_est": codigo,
        "est_sentido": sentido,
        "est_latitud": lat,
        "est_longitud": lon,
        "nombre": nombre,
    }


FILAS = [
    fila("RTA", "SN", -2.91965, -79.03882, "Río Tarqui"),
    fila("RTA", "NS", -2.91965, -79.039, "Río Tarqui"),
    fila("ESA", "SN", -2.9144, -79.0375, "EL Salado"),
    fila("ESA", "NS", -2.9144, -79.0375, "EL Salado"),
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
    }
    assert salado["geometry"]["coordinates"] == [-79.0375, -2.9144]
    # Río Tarqui tiene un andén por sentido, a unos metros: dos puntos.
    assert len(por_id["RTA"]) == 2
    assert por_id["HMI"][0]["properties"]["hacia"] == ["Parque Industrial"]
    assert por_id["OLA"][0]["properties"]["nombre"] == "Ordóñez Lazo"


def test_parsear_estaciones_rechaza_respuestas_raras():
    with pytest.raises(ValueError):
        tranvia.parsear_estaciones(b'{"error": "x"}')
    with pytest.raises(ValueError):
        tranvia.parsear_estaciones(json.dumps(FILAS[:3]).encode())
