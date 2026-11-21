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
    # En la misma consulta van los barrios, las parroquias y las urbanizaciones.
    assert '"place"' in consulta and '"boundary"="administrative"' in consulta
    assert resultado.resumen == {"calles": 2, "tramos": 3, "barrios": 0, "salud": 0}
    assert list(resultado.archivos) == [
        "calles/calles.geojson",
        "ciudad/barrios.json",
        "ciudad/salud.json",
    ]


def test_parsear_barrios_toma_lugares_parroquias_y_urbanizaciones():
    elementos = [
        {
            "type": "node",
            "lat": -2.9,
            "lon": -79.0,
            "tags": {"place": "neighbourhood", "name": "El Vergel"},
        },
        # Una parroquia (área): se guarda su centro, y gana a un barrio con el mismo nombre.
        {
            "type": "node",
            "lat": -2.89,
            "lon": -78.98,
            "tags": {"place": "hamlet", "name": "Totoracocha"},
        },
        {
            "type": "relation",
            "center": {"lat": -2.8913562, "lon": -78.9826757},
            "tags": {"boundary": "administrative", "admin_level": "9", "name": "Totoracocha"},
        },
        {
            "type": "way",
            "center": {"lat": -2.89, "lon": -78.96},
            "tags": {"landuse": "residential", "name": "Cdla. de los Ingenieros"},
        },
        # Una parroquia rural cuyo centro cae fuera de la ciudad, una calle y un lugar sin nombre.
        {
            "type": "relation",
            "center": {"lat": -2.98, "lon": -79.2},
            "tags": {"boundary": "administrative", "name": "Baños"},
        },
        {
            "type": "way",
            "geometry": [{"lat": -2.9, "lon": -79.0}, {"lat": -2.9, "lon": -79.01}],
            "tags": {"highway": "residential", "name": "Calle Larga"},
        },
        {"type": "node", "lat": -2.9, "lon": -79.0, "tags": {"place": "hamlet"}},
    ]
    datos = calles.parsear_barrios(json.dumps({"elements": elementos}).encode())
    assert [(b["nombre"], b["tipo"]) for b in datos["barrios"]] == [
        ("Cdla. de los Ingenieros", "urbanizacion"),
        ("El Vergel", "neighbourhood"),
        ("Totoracocha", "parroquia"),
    ]
    totoracocha = datos["barrios"][2]
    assert (totoracocha["lat"], totoracocha["lon"]) == (-2.89136, -78.98268)


def test_parsear_salud_clasifica_y_descarta_lo_que_no_es_atencion_general():
    def lugar(nombre, amenity="hospital", tipo="node", **extra):
        punto = {"lat": -2.9, "lon": -79.0}
        base = punto if tipo == "node" else {"center": punto}
        return {"type": tipo, **base, "tags": {"amenity": amenity, "name": nombre, **extra}}

    elementos = [
        lugar("Hospital Regional Vicente Corral Moscoso", tipo="way", emergency="yes"),
        lugar("Subcentro de Salud Ricaurte", phone="+593 7 4209089"),
        lugar("Centro de Salud Carlos Elizalde", amenity="clinic", tipo="way"),
        lugar("Clínica Cuenca"),
        lugar("Hospital Militar", emergency="yes"),  # emergencias, pero no para todos
        lugar("Clínica dental Dr. Monsalve"),  # dentista: fuera
        lugar("Centro de Rehabilitación y Fisioterapia"),  # rehabilitación: fuera
        lugar("Dispensario SSC Barabon"),  # ni hospital ni centro de salud por su nombre
    ]
    datos = calles.parsear_salud(json.dumps({"elements": elementos}).encode())
    tipos = {lugar["nombre"]: lugar["tipo"] for lugar in datos["lugares"]}
    assert tipos == {
        "Hospital Regional Vicente Corral Moscoso": "emergencias",
        "Subcentro de Salud Ricaurte": "centro_salud",
        "Centro de Salud Carlos Elizalde": "centro_salud",
        "Clínica Cuenca": "hospital",
        "Hospital Militar": "hospital",
    }
    ricaurte = next(lugar for lugar in datos["lugares"] if "Ricaurte" in lugar["nombre"])
    assert ricaurte["telefono"] == "+593 7 4209089"
