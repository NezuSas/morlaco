import json
from urllib.parse import parse_qs, urlparse

from morlaco.fuentes import movilidad

OVERPASS = json.dumps(
    {
        "elements": [
            {
                "type": "node",
                "id": 1,
                "lat": -2.8973,
                "lon": -79.0045,
                "tags": {
                    "amenity": "bicycle_rental",
                    "name": "7. Parque Calderón",
                    "network": "BiciCuenca",
                    "capacity": "20",
                },
            },
            {
                "type": "way",
                "id": 2,
                "center": {"lat": -2.91, "lon": -79.01},
                "tags": {
                    "amenity": "charging_station",
                    "operator": "BYD Cuenca",
                    "access": "customers",
                    "socket:type2": "2",
                },
            },
            {
                "type": "node",
                "id": 3,
                "lat": -2.9,
                "lon": -79.0,
                "tags": {"amenity": "charging_station"},
            },
            {"type": "node", "id": 4, "tags": {"amenity": "bicycle_rental"}},
            {
                "type": "way",
                "id": 5,
                "tags": {"highway": "cycleway", "name": "Ciclovía del Tomebamba"},
                "geometry": [{"lat": -2.9, "lon": -79.01}, {"lat": -2.9, "lon": -79.0}],
            },
            {
                "type": "way",
                "id": 6,
                "tags": {"highway": "secondary", "cycleway:right": "lane"},
                "geometry": [{"lat": -2.91, "lon": -79.01}, {"lat": -2.91, "lon": -79.0}],
            },
        ]
    }
).encode()


def test_parsear_overpass_separa_las_tres_capas():
    capas = movilidad.parsear_overpass(OVERPASS)
    (estacion,) = capas["bicicletas"]["features"]
    assert estacion["properties"] == {
        "id": "node/1",
        "nombre": "7. Parque Calderón",
        "red": "BiciCuenca",
        "capacidad": 20,
    }
    assert estacion["geometry"]["coordinates"] == [-79.0045, -2.8973]

    carga = {c["properties"]["id"]: c for c in capas["carga"]["features"]}
    byd = carga["way/2"]["properties"]
    assert (byd["nombre"], byd["acceso"], byd["conectores"]) == (
        "BYD Cuenca",
        "clientes",
        ["type2"],
    )
    assert carga["way/2"]["geometry"]["coordinates"] == [-79.01, -2.91]  # centro del área
    assert carga["node/3"]["properties"]["acceso"] == "publico"

    tipos = {c["properties"]["id"]: c["properties"]["tipo"] for c in capas["ciclovias"]["features"]}
    assert tipos == {"way/5": "separada", "way/6": "carril"}
    assert capas["ciclovias"]["metadata"]["licencia"].startswith("Open Database License")


def test_obtener_consulta_overpass_y_escribe_tres_archivos():
    pedidas = []

    def falso(url):
        pedidas.append(url)
        return OVERPASS

    resultado = movilidad.obtener(falso)
    consulta = parse_qs(urlparse(pedidas[0]).query)["data"][0]
    assert (
        "bicycle_rental" in consulta and "charging_station" in consulta and "cycleway" in consulta
    )
    assert sorted(resultado.archivos) == [
        "movilidad/bicicletas.geojson",
        "movilidad/carga.geojson",
        "movilidad/ciclovias.geojson",
    ]
    assert resultado.resumen == {"bicicletas": 1, "carga": 2, "ciclovias": 2}
