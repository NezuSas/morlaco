import pytest

from morlaco.fuentes import emac

# Imita la estructura real del KML de EMAC: zonas con nombre y descripción, y una
# zona (la 5) que trae nombre y frecuencia solo en los datos extendidos.
KML = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Zonas de Recolección</name>
<Folder><name>Zona1</name>
  <Placemark><name>ZONA 1</name>
    <description>Lunes - Miércoles - Viernes HORARIO: 08h00 a 12h00</description>
    <Polygon><outerBoundaryIs><LinearRing><coordinates>
      -79.01,-2.90,0 -79.00,-2.90,0 -79.00,-2.89,0 -79.01,-2.90,0
    </coordinates></LinearRing></outerBoundaryIs>
    <innerBoundaryIs><LinearRing><coordinates>
      -79.006,-2.897,0 -79.004,-2.897,0 -79.004,-2.895,0
    </coordinates></LinearRing></innerBoundaryIs></Polygon>
  </Placemark>
</Folder>
<Folder><name>Zona5</name>
  <Placemark><name></name>
    <description><![CDATA[descripción: <br>fid: 1<br>DESCRIPCIO: ZONA 5]]></description>
    <ExtendedData>
      <Data name="DESCRIPCIO"><value>ZONA 5</value></Data>
      <Data name="FRECUENCIA"><value>Martes - Jueves - Sábado HORARIO: 20h00 a 24h00</value></Data>
    </ExtendedData>
    <Polygon><outerBoundaryIs><LinearRing><coordinates>
      -79.02,-2.91,0 -79.01,-2.91,0 -79.01,-2.92,0
    </coordinates></LinearRing></outerBoundaryIs></Polygon>
  </Placemark>
</Folder>
</Document></kml>""".encode()


def test_parsear_frecuencia_lunes_miercoles_viernes():
    assert emac.parsear_frecuencia("Lunes - Miércoles - Viernes HORARIO: 08h00 a 12h00") == {
        "dias": ["lunes", "miércoles", "viernes"],
        "dias_iso": [1, 3, 5],
        "desde": "08:00",
        "hasta": "12:00",
        "dia_reciclaje": "miércoles",
    }


def test_parsear_frecuencia_sin_tildes_y_reciclaje_jueves():
    frecuencia = emac.parsear_frecuencia("martes - jueves - sabado horario: 8h00 a 12h00")
    assert frecuencia["dias_iso"] == [2, 4, 6]
    assert frecuencia["desde"] == "08:00"
    assert frecuencia["dia_reciclaje"] == "jueves"


@pytest.mark.parametrize("texto", ["Lunes y viernes", "HORARIO: 08h00 a 12h00"])
def test_parsear_frecuencia_incompleta_falla(texto):
    with pytest.raises(ValueError):
        emac.parsear_frecuencia(texto)


def test_parsear_kml_lee_zonas_ordenadas_con_su_horario():
    zonas = emac.parsear_kml(KML)
    assert zonas["type"] == "FeatureCollection"
    assert [z["properties"]["zona"] for z in zonas["features"]] == [1, 5]

    zona5 = zonas["features"][1]["properties"]
    assert zona5["nombre"] == "Zona 5"
    assert zona5["dias"] == ["martes", "jueves", "sábado"]
    assert (zona5["desde"], zona5["hasta"]) == ("20:00", "24:00")


def test_parsear_kml_geometria_con_hueco_y_anillos_cerrados():
    zona1, zona5 = emac.parsear_kml(KML)["features"]
    assert zona1["geometry"]["type"] == "Polygon"
    exterior, hueco = zona1["geometry"]["coordinates"]
    assert exterior[0] == [-79.01, -2.9]
    assert hueco[0] == hueco[-1]  # el anillo interior venía abierto y se cierra
    assert zona5["geometry"]["coordinates"][0][0] == zona5["geometry"]["coordinates"][0][-1]


def test_obtener_usa_el_kml_publico():
    pedidas = []

    def falso(url):
        pedidas.append(url)
        return KML

    resultado = emac.obtener(falso)
    assert pedidas == [emac.KML_URL]
    assert resultado.resumen == {"zonas": 2, "numeros": [1, 5], "calendarios": 2}
    assert list(resultado.archivos) == [
        "recoleccion/zonas.geojson",
        "recoleccion/calendarios/zona-1.ics",
        "recoleccion/calendarios/zona-5.ics",
    ]
    assert resultado.archivos["recoleccion/calendarios/zona-5.ics"].startswith("BEGIN:VCALENDAR")
