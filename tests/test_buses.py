import json

import pytest
from test_trazados import _zip_shapefile

from morlaco.fuentes import buses

RUTAS = (
    '"LINEA","COMPANIA","SENTIDO","ORIGEN","DESTINO","LUNES_VIERNES_INICIO",'
    '"LUNES_VIERNES_FIN","LUNES_VIERNES_INTERVALO","SABADOS_INICIO","SABADOS_FIN",'
    '"SABADOS_INTERVALO","DOMINGOS_INICIO","DOMINGOS_FIN","DOMINGOS_INTERVALO"\n'
    '"10","URBA","IDA","A","B","6:00","20:00","0:20","","","","","",""\n'
    '"1","SIT","RETORNO","KENNEDY","LIRIO","6:00","21:30","0:09","6:00","21:15","0:12",'
    '"6:00","20:15","0:15"\n'
    '"1","SIT","IDA","LIRIO","KENNEDY","5:50","21:15","0:09","5:50","20:30","0:12",'
    '"6:00","20:00","0:15"\n'
)

RECORRIDOS = (
    "LINEA,PUNTO_RECORRIDO,SENTIDO\n"
    "2,PARQUE,IDA\n"
    "1,TERMINAL LIRIO,IDA\n"
    "1,SECTOR GULAG,IDA\n"
    "1,KENNEDY,RETORNO\n"
    "11B,FERIA LIBRE,IDA\n"
)

PARADAS = (
    "N,Ubicacion,Latitud,Longitud,Paleta\n"
    "1,AV 3 DE NOVIEMBRE INTERSECCION RAMON BORRERO,-2.895.956,-79.014.574,SI\n"
    "2,AV 10 DE AGOSTO,-2.9,-79.01,NO\n"
    "3,COORDENADA ROTA,,,SI\n"
    "4,FUERA DE CUENCA,-0.180.653,-78.467.838,SI\n"
)


def test_intervalo_minutos():
    assert buses.intervalo_minutos("0:09") == 9
    assert buses.intervalo_minutos("1:05") == 65
    assert buses.intervalo_minutos("15") == 15
    assert buses.intervalo_minutos("") is None
    assert buses.intervalo_minutos("n/d") is None


def test_parsear_rutas_ordena_por_numero_de_linea_y_sentido():
    rutas = buses.parsear_rutas(RUTAS)
    assert [(r["linea"], r["sentido"]) for r in rutas] == [
        ("1", "ida"),
        ("1", "retorno"),
        ("10", "ida"),
    ]
    assert rutas[0]["horarios"]["lunes_viernes"] == {
        "inicio": "05:50",
        "fin": "21:15",
        "intervalo_min": 9,
    }


def test_parsear_rutas_sin_servicio_el_fin_de_semana():
    linea10 = buses.parsear_rutas(RUTAS)[2]
    assert linea10["horarios"]["sabados"] is None
    assert linea10["horarios"]["domingos"] is None


def test_parsear_recorridos_agrupa_y_conserva_el_orden():
    assert buses.parsear_recorridos(RECORRIDOS) == [
        {
            "linea": "1",
            "sentidos": {"ida": ["TERMINAL LIRIO", "SECTOR GULAG"], "retorno": ["KENNEDY"]},
        },
        {"linea": "2", "sentidos": {"ida": ["PARQUE"]}},
        {"linea": "11B", "sentidos": {"ida": ["FERIA LIBRE"]}},
    ]


@pytest.mark.parametrize(
    ("texto", "enteros", "esperado"),
    [
        ("-2.895.956", 1, -2.895956),
        ("-79.014.574", 2, -79.014574),
        ("-2.895956", 1, -2.895956),  # una coordenada bien escrita no se altera
        ("-2.9", 1, -2.9),
    ],
)
def test_corregir_coordenada(texto, enteros, esperado):
    assert buses.corregir_coordenada(texto, enteros) == pytest.approx(esperado)


def test_corregir_coordenada_vacia_falla():
    with pytest.raises(ValueError):
        buses.corregir_coordenada("", 1)


def test_parsear_paradas_descarta_rotas_y_fuera_de_cuenca():
    paradas, descartadas = buses.parsear_paradas(PARADAS)
    assert descartadas == 2
    primera, segunda = paradas["features"]
    assert primera["geometry"]["coordinates"] == pytest.approx([-79.014574, -2.895956])
    assert primera["properties"] == {
        "id": 1,
        "ubicacion": "AV 3 DE NOVIEMBRE INTERSECCION RAMON BORRERO",
        "tiene_paleta": True,
    }
    assert segunda["properties"]["tiene_paleta"] is False


def test_csv_mas_reciente():
    paquete = {
        "resources": [
            {"format": "CSV", "created": "2025-03-01T00:00:00", "url": "viejo"},
            {"format": "ODS", "created": "2026-05-01T00:00:00", "url": "hoja"},
            {"format": "csv", "created": "2026-04-01T00:00:00", "url": "nuevo"},
        ]
    }
    assert buses.csv_mas_reciente(paquete)["url"] == "nuevo"
    with pytest.raises(ValueError):
        buses.csv_mas_reciente({"name": "vacio", "resources": []})


def test_obtener_consulta_la_api_de_ckan():
    contenidos = {"rutas": RUTAS, "recorridos": RECORRIDOS, "paradas": PARADAS}
    shapefile_zip = _zip_shapefile(
        [
            (
                [(721000.0, 9679000.0), (721000.0, 9680000.0)],
                {
                    "linename": "1",
                    "name": "L1 Kennedy",
                    "direction": ">",
                    "length": "20.9km",
                    "empresa": "SIT",
                },
            )
        ]
    )

    def falso(url):
        if url == "zip/rutas":
            return shapefile_zip
        for clave, identificador in buses.DATASETS.items():
            if url.endswith(f"package_show?id={identificador}"):
                paquete = {
                    "id": identificador,
                    "name": clave,
                    "title": clave.title(),
                    "license_title": "Creative Commons Non-Commercial (Cualquiera)",
                    "resources": [
                        {"format": "CSV", "created": "2026", "url": f"csv/{clave}"},
                        {"format": "ZIP", "name": "RutasTransporteGeo.zip", "url": f"zip/{clave}"},
                    ],
                }
                return json.dumps({"success": True, "result": paquete}).encode()
            if url == f"csv/{clave}":
                # El recorrido real viene en Windows-1252.
                return contenidos[clave].encode("cp1252")
        raise AssertionError(f"URL inesperada: {url}")

    resultado = buses.obtener(falso)
    assert resultado.resumen == {
        "trazados": 1,
        "rutas": 3,
        "lineas": 2,
        "lineas_con_recorrido": 3,
        "paradas": 2,
        "paradas_descartadas": 2,
    }
    paradas = resultado.archivos["buses/paradas.geojson"]
    assert paradas["metadata"]["licencia"].startswith("Creative Commons Non-Commercial")
    lineas = resultado.archivos["buses/lineas.geojson"]
    assert lineas["features"][0]["properties"]["linea"] == "1"
    assert "2022" in lineas["metadata"]["nota"]
