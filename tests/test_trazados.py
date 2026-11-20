import io
import json
import zipfile

import pytest
import shapefile

from morlaco.fuentes import trazados
from morlaco.geo import utm_a_geograficas

PRJ = (
    'PROJCS["WGS_1984_UTM_Zone_17S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",'
    'SPHEROID["WGS_1984",6378137,298.257223563]]],PROJECTION["Transverse_Mercator"]]'
)


def test_utm_a_geograficas_coincide_con_pyproj():
    # Valores de referencia calculados con pyproj (EPSG:32717 -> EPSG:4326).
    lon, lat = utm_a_geograficas(721950.0, 9679500.0)
    assert lon == pytest.approx(-79.00325951, abs=1e-8)
    assert lat == pytest.approx(-2.89786975, abs=1e-8)
    lon, lat = utm_a_geograficas(500000.0, 9000000.0)
    assert lon == pytest.approx(-81.0, abs=1e-8)
    assert lat == pytest.approx(-9.04656246, abs=1e-8)


@pytest.mark.parametrize(
    ("registro", "esperado"),
    [
        (
            {"linename": "7", "name": "L7 Mall del Rio", "direction": ">", "empresa": "UNCOMETRO"},
            {"linea": "7", "tipo": "linea", "hacia": "Mall del Río", "sentido": "ida"},
        ),
        (
            {"linename": "11B", "name": "L11B San Pedro", "direction": "<", "empresa": "TOMEBAMBA"},
            {"linea": "11B", "tipo": "linea", "hacia": "San Pedro", "sentido": "retorno"},
        ),
        (
            {
                "linename": "RUTA TRANVIA",
                "name": "T1 Control Sur",
                "direction": "<",
                "empresa": "SIT",
            },
            {"linea": "Tranvía", "tipo": "tranvia", "hacia": "Control Sur", "sentido": "retorno"},
        ),
        (
            {
                "linename": "Alimentador Banos",
                "name": "A1 Banos",
                "direction": "<",
                "empresa": "SIT",
            },
            {"linea": "A1", "tipo": "alimentador", "hacia": "Baños", "sentido": "retorno"},
        ),
        (
            {
                "linename": "10",
                "name": "ALARGUE IDAN BIBIN",
                "direction": "",
                "empresa": "UNCOMETRO",
            },
            {"linea": "10", "tipo": "alargue", "hacia": "Bibin", "sentido": "ida"},
        ),
        (
            {
                "linename": "1",
                "name": "ALARGUE RETORNO MARIANZA",
                "direction": "<",
                "empresa": "SIT",
            },
            {"linea": "1", "tipo": "alargue", "hacia": "Marianza", "sentido": "retorno"},
        ),
    ],
)
def test_describir(registro, esperado):
    descripcion = trazados.describir(registro)
    assert {k: descripcion[k] for k in esperado} == esperado


def test_describir_falla_con_un_nombre_desconocido():
    with pytest.raises(ValueError):
        trazados.describir({"linename": "?", "name": "Ruta rara", "direction": ">"})


def _zip_shapefile(registros):
    shp, shx, dbf = io.BytesIO(), io.BytesIO(), io.BytesIO()
    escritor = shapefile.Writer(
        shp=shp, shx=shx, dbf=dbf, shapeType=shapefile.POLYLINE, encoding="utf-8"
    )
    for campo in ("linename", "name", "direction", "length", "empresa"):
        escritor.field(campo, "C", size=60)
    for puntos, valores in registros:
        escritor.line([puntos])
        escritor.record(**valores)
    escritor.close()
    salida = io.BytesIO()
    with zipfile.ZipFile(salida, "w") as archivo:
        archivo.writestr("Red_transporte.shp", shp.getvalue())
        archivo.writestr("Red_transporte.shx", shx.getvalue())
        archivo.writestr("Red_transporte.dbf", dbf.getvalue())
        archivo.writestr("Red_transporte.cpg", "UTF-8")
        archivo.writestr("Red_transporte.prj", PRJ)
    return salida.getvalue()


def test_parsear_shapefile_convierte_y_ordena():
    contenido = _zip_shapefile(
        [
            (
                [(721000.0, 9679000.0), (721500.0, 9679000.0), (722000.0, 9679000.0)],
                {
                    "linename": "1",
                    "name": "ALARGUE IDA MARIANZA",
                    "direction": ">",
                    "length": "1.9km",
                    "empresa": "SIT",
                },
            ),
            (
                [(721000.0, 9679000.0), (721000.0, 9680000.0), (722000.0, 9680000.0)],
                {
                    "linename": "1",
                    "name": "L1 Kennedy",
                    "direction": ">",
                    "length": "20.899km",
                    "empresa": "SIT",
                },
            ),
        ]
    )
    linea, alargue = trazados.parsear_shapefile(contenido)
    assert linea["properties"]["tipo"] == "linea"
    assert linea["properties"]["longitud_km"] == 20.899
    assert linea["geometry"]["type"] == "LineString"
    lon, lat = linea["geometry"]["coordinates"][0]
    assert -79.1 < lon < -78.9 and -3.0 < lat < -2.8
    # Los tres puntos del alargue están en línea recta: la simplificación deja los extremos.
    assert len(alargue["geometry"]["coordinates"]) == 2


def test_parsear_shapefile_exige_utm_17_sur():
    contenido = _zip_shapefile(
        [
            (
                [(0.0, 0.0), (1.0, 1.0)],
                {"linename": "1", "name": "L1 X", "direction": ">", "length": "", "empresa": ""},
            )
        ]
    )
    otro = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(contenido)) as original, zipfile.ZipFile(otro, "w") as copia:
        for nombre in original.namelist():
            datos = original.read(nombre)
            copia.writestr(
                nombre, b'PROJCS["WGS_1984_UTM_Zone_18N"]' if nombre.endswith(".prj") else datos
            )
    with pytest.raises(ValueError):
        trazados.parsear_shapefile(otro.getvalue())


def test_zip_mas_reciente():
    paquete = {
        "resources": [
            {
                "format": "ZIP",
                "name": "GADCuenca_RutasTransporteGeo_2022Septiembre.zip",
                "created": "2022",
                "url": "geo",
            },
            {"format": "ZIP", "name": "otro.zip", "created": "2026", "url": "otro"},
            {"format": "CSV", "name": "rutas.csv", "created": "2026", "url": "csv"},
        ]
    }
    assert trazados.zip_mas_reciente(paquete)["url"] == "geo"
    with pytest.raises(ValueError):
        trazados.zip_mas_reciente({"name": "x", "resources": []})


def _ide(nombre, direccion, puntos):
    return {
        "type": "Feature",
        "properties": {"linename": "4", "name": nombre, "direction": direccion,
                       "length": "16.856km", "empresa": "SIT"},
        "geometry": {"type": "MultiLineString", "coordinates": [puntos]},
    }  # fmt: skip


def test_parsear_ide_y_reemplazar_la_linea():
    recta = [[-79.04, -2.92], [-79.02, -2.91], [-79.0, -2.9]]
    capa = json.dumps({"features": [
        _ide("L4 Terminal Terrestre", ">", recta),
        _ide("L4 Plataforma Narancay", "<", recta[::-1]),
    ]}).encode()  # fmt: skip
    nuevas = trazados.parsear_ide(capa)
    assert [(f["properties"]["sentido"], f["properties"]["hacia"]) for f in nuevas] == [
        ("ida", "Terminal Terrestre"),
        ("retorno", "Plataforma Narancay"),
    ]
    # Tres puntos en línea recta: queda un LineString con los extremos.
    assert nuevas[0]["geometry"] == {"type": "LineString", "coordinates": [recta[0], recta[-1]]}
    assert nuevas[0]["properties"]["fuente"] == "ide"

    def vieja(linea, tipo, sentido):
        return {"properties": {"linea": linea, "tipo": tipo, "sentido": sentido, "hacia": "x"}}

    antes = [vieja("4", "linea", "ida"), vieja("4", "linea", "retorno"),
             vieja("4", "alargue", "ida"), vieja("1", "linea", "ida")]  # fmt: skip
    despues = trazados.reemplazar_lineas(antes, nuevas)
    assert len(despues) == 4
    assert [f["properties"].get("fuente") for f in despues if f["properties"]["linea"] == "4"
            and f["properties"]["tipo"] == "linea"] == ["ide", "ide"]  # fmt: skip
    assert vieja("4", "alargue", "ida") in despues  # los alargues se quedan
    with pytest.raises(ValueError, match="ida y el retorno"):
        trazados.reemplazar_lineas(antes, nuevas[:1])
    url = trazados.url_ide("4")
    assert "typeNames=ide%3Admt_linea4" in url and "EPSG%3A4326" in url


def _linea(linea, tipo, sentido, hacia, coords):
    return {
        "type": "Feature",
        "properties": {"linea": linea, "tipo": tipo, "sentido": sentido, "hacia": hacia},
        "geometry": {"type": "LineString", "coordinates": coords},
    }


def _calle(nombre, coords):
    geometria = {"type": "LineString", "coordinates": coords}
    return {"properties": {"nombre": nombre}, "geometry": geometria}


# La línea va por el Camino del Tejar (lat -2.880) hasta lon -79.030 y ahí baja al sur.
_TEJAR = [[-79.020, -2.880], [-79.030, -2.880]]
_LINEA = _linea("8", "linea", "ida", "San Joaquín", [*_TEJAR, [-79.030, -2.890]])
# El alargue empieza 1,1 km más al oeste, al final del Camino del Tejar, y sube al norte.
_ALARGUE = _linea("8", "alargue", "ida", "Dolorosa", [[-79.040, -2.880], [-79.040, -2.870]])


def test_unir_alargues_sigue_la_misma_calle():
    calles = {
        "features": [
            _calle("Camino del Tejar", [*_TEJAR, [-79.035, -2.8805], [-79.040, -2.880]]),
            # Un atajo apenas más corto que obliga a cambiar dos veces de calle.
            _calle("Del Yugo", [[-79.030, -2.880], [-79.035, -2.8795]]),
            _calle("Los Hornos", [[-79.035, -2.8795], [-79.040, -2.880]]),
        ]
    }
    entidades, unidos = trazados.unir_alargues([_LINEA, _ALARGUE], calles)
    alargue = entidades[1]
    assert unidos and unidos[0].startswith("8 ida Dolorosa")
    assert 1000 < alargue["properties"]["union_calles_m"] < 1300
    coords = alargue["geometry"]["coordinates"]
    assert [-79.035, -2.8805] in coords, "va por el Camino del Tejar, no por el atajo"
    assert coords[-1] == [-79.040, -2.870]  # y sigue con el tramo del alargue
    assert entidades[0] is _LINEA


def test_unir_alargues_no_toca_los_unidos_ni_inventa_tramos_largos():
    unido = _linea("8", "alargue", "ida", "El Rosal", [[-79.030, -2.890], [-79.030, -2.900]])
    lejos = _linea("8", "alargue", "ida", "Yunga", [[-79.090, -2.880], [-79.090, -2.870]])
    # Una sola calle de 6,7 km: más de lo que se une.
    calles = {"features": [_calle("Camino del Tejar", [[-79.030, -2.880], [-79.090, -2.880]])]}
    entidades, unidos = trazados.unir_alargues([_LINEA, unido, lejos], calles)
    assert unidos == []
    assert entidades[1] is unido and entidades[2] is lejos
