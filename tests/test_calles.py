import json
from urllib.parse import parse_qs, urlparse

from morlaco.fuentes import calles


def via(nombre, tipo, puntos, **extra):
    return {
        "type": "way",
        "tags": {"highway": tipo, "name": nombre, **extra},
        "geometry": [{"lon": lon, "lat": lat} for lon, lat in puntos],
    }


OVERPASS = json.dumps(
    {
        "elements": [
            via("Benigno Malo", "residential", [(-79.0050, -2.8960), (-79.0040, -2.8980)]),
            via(
                "Simón Bolívar",
                "tertiary",
                [(-79.0060, -2.8970), (-79.0030, -2.8970)],
                alt_name="Calle Bolívar",
            ),
            via("Simón Bolívar", "residential", [(-79.0030, -2.8970), (-79.0010, -2.8970)]),
            via("Escalinata", "steps", [(-79.0, -2.9), (-79.001, -2.9)]),
            via("Sin geometría", "residential", [(-79.0, -2.9)]),
        ]
    }
).encode()


def test_simplificar_quita_puntos_casi_alineados():
    # El punto del medio se desvía ~1 m de la recta: sobra con 4 m de tolerancia.
    linea = [[-79.0, -2.9], [-78.99950, -2.90001], [-78.999, -2.9]]
    assert calles.simplificar(linea) == [[-79.0, -2.9], [-78.999, -2.9]]
    # Una esquina de verdad (unos 100 m) se conserva.
    esquina = [[-79.0, -2.9], [-78.999, -2.9], [-78.999, -2.899]]
    assert calles.simplificar(esquina) == esquina


def test_parsear_overpass_agrupa_por_nombre_y_filtra():
    coleccion = calles.parsear_overpass(OVERPASS)
    nombres = [f["properties"]["nombre"] for f in coleccion["features"]]
    assert nombres == ["Benigno Malo", "Simón Bolívar"]

    bolivar = coleccion["features"][1]
    assert bolivar["geometry"]["type"] == "MultiLineString"
    assert len(bolivar["geometry"]["coordinates"]) == 2
    # Toma el tipo más importante de sus tramos y guarda los nombres alternativos.
    assert bolivar["properties"]["tipo"] == "tertiary"
    assert bolivar["properties"]["rango"] == 5
    assert bolivar["properties"]["otros_nombres"] == ["Calle Bolívar"]
    assert coleccion["metadata"]["licencia"].startswith("Open Database License")


def test_obtener_consulta_overpass_dentro_de_cuenca():
    pedidas = []

    def falso(url):
        pedidas.append(url)
        return OVERPASS

    resultado = calles.obtener(falso)
    consulta = parse_qs(urlparse(pedidas[0]).query)["data"][0]
    assert '"highway"' in consulta and "-2.98,-79.1,-2.82,-78.92" in consulta
    assert resultado.resumen == {"calles": 2, "tramos": 3}
    assert list(resultado.archivos) == ["calles/calles.geojson"]
