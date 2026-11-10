import csv
import io
import zipfile

import pytest

from morlaco import gtfs


def tabla(texto):
    return list(csv.DictReader(io.StringIO(texto)))


def forma(linea, sentido, hacia, coords, tipo="linea"):
    return {
        "type": "Feature",
        "properties": {"linea": linea, "tipo": tipo, "hacia": hacia, "sentido": sentido},
        "geometry": {"type": "LineString", "coordinates": coords},
    }


HORARIO = {
    "lunes_viernes": {"inicio": "05:50", "fin": "21:15", "intervalo_min": 9},
    "sabados": {"inicio": "06:00", "fin": "20:30", "intervalo_min": 12},
    "domingos": None,
}
RUTAS = [
    {
        "linea": "7",
        "compania": "UNCOMETRO",
        "sentido": "ida",
        "origen": "TRIGALES",
        "destino": "MALL DEL RIO",
        "horarios": HORARIO,
    },
    {
        "linea": "7",
        "compania": "UNCOMETRO",
        "sentido": "retorno",
        "origen": "MALL DEL RIO",
        "destino": "",
        "horarios": HORARIO,
    },
]
# Ida hacia el este (unos 2,2 km) y retorno por la calle paralela.
IDA = [[-79.02, -2.9], [-79.01, -2.9], [-79.0, -2.9]]
RETORNO = [[-79.0, -2.9001], [-79.01, -2.9001], [-79.02, -2.9001]]
LINEAS = [
    forma("7", "ida", "Mall del Rio", IDA),
    forma("7", "retorno", "Trigales Altos", RETORNO),
    forma("7", "ida", "Capulies", [[-79.0, -2.9], [-78.99, -2.89]], tipo="alargue"),
]
PARADAS = [
    {
        "properties": {"id": 10, "ubicacion": "AV. X INTERSECCION CALLE ZETA"},
        "geometry": {"coordinates": [-79.012, -2.90005]},
    },
    {
        "properties": {"id": 11, "ubicacion": "PARADA LEJANA"},
        "geometry": {"coordinates": [-79.012, -2.91]},
    },
    {
        "properties": {"id": 12, "ubicacion": "AV. Z"},
        "geometry": {"coordinates": [-79.005, -2.90002]},
    },
]


def test_hora_gtfs_admite_mas_de_24_horas():
    assert gtfs.hora_gtfs(5 * 3600 + 50 * 60) == "05:50:00"
    assert gtfs.hora_gtfs(25 * 3600 + 61) == "25:01:01"


def test_proyectar_sobre_la_linea():
    acumulado = gtfs.recorrido_acumulado(IDA)
    assert acumulado[-1] == pytest.approx(2224, abs=5)
    metros, distancia = gtfs.proyectar([-79.01, -2.9001], IDA, acumulado)
    assert metros == pytest.approx(1112, abs=5)
    assert distancia == pytest.approx(11, abs=1)


def test_elegir_trazados_reparte_dos_retornos_por_destino():
    lineas = [
        forma("11B", "retorno", "San Pedro", IDA),
        forma("11B", "retorno", "Centenario", RETORNO),
    ]
    rutas = [{"linea": "11B", "sentido": "ida", "destino": "CENTENARIO"}]
    elegidos = gtfs.elegir_trazados(lineas, rutas)
    assert elegidos[("11B", "ida")]["properties"]["hacia"] == "Centenario"
    assert elegidos[("11B", "retorno")]["properties"]["hacia"] == "San Pedro"


def test_extremos_completa_lo_que_falta_con_el_trazado():
    trazados = gtfs.elegir_trazados(LINEAS, RUTAS)
    assert gtfs.extremos("7", "retorno", RUTAS[1], trazados) == ("MALL DEL RIO", "Trigales Altos")


def test_nombre_empresa():
    assert gtfs.nombre_empresa("TURISMO BANIOS") == "Turismo Baños"
    assert gtfs.nombre_empresa("SIT") == "SIT"
    assert gtfs.nombre_empresa("UNCOMETRO") == "Uncometro"


def test_construir_arma_un_feed_de_frecuencias():
    archivos, resumen = gtfs.construir(RUTAS, LINEAS, PARADAS)
    assert set(archivos) == {
        "agency.txt", "routes.txt", "trips.txt", "stops.txt", "stop_times.txt",
        "frequencies.txt", "shapes.txt", "calendar.txt", "feed_info.txt",
    }  # fmt: skip
    (ruta,) = tabla(archivos["routes.txt"])
    assert (ruta["route_id"], ruta["route_short_name"], ruta["route_type"]) == ("L7", "7", "3")
    assert ruta["route_long_name"] == "Trigales - Mall del Río"

    viajes = tabla(archivos["trips.txt"])
    # Ida y retorno, de lunes a viernes y sábados (los domingos no hay servicio).
    assert sorted(v["trip_id"] for v in viajes) == [
        "L7-ida-LV",
        "L7-ida-SA",
        "L7-retorno-LV",
        "L7-retorno-SA",
    ]
    assert {v["trip_headsign"] for v in viajes} == {"Mall del Río", "Trigales Altos"}

    frecuencia = next(f for f in tabla(archivos["frequencies.txt"]) if f["trip_id"] == "L7-ida-LV")
    assert frecuencia == {
        "trip_id": "L7-ida-LV", "start_time": "05:50:00", "end_time": "21:15:00",
        "headway_secs": "540", "exact_times": "0",
    }  # fmt: skip
    assert [c["service_id"] for c in tabla(archivos["calendar.txt"])] == ["LV", "SA"]
    assert resumen["rutas"] == 1 and resumen["viajes"] == 4


def test_construir_ordena_las_paradas_y_estima_los_tiempos():
    archivos, _ = gtfs.construir(RUTAS, LINEAS, PARADAS)
    horarios = [h for h in tabla(archivos["stop_times.txt"]) if h["trip_id"] == "L7-ida-LV"]
    assert [h["stop_id"] for h in horarios] == ["T-L7-trigales", "P10", "P12", "T-L7-mall-del-rio"]
    distancias = [float(h["shape_dist_traveled"]) for h in horarios]
    assert distancias == sorted(distancias) and len(set(distancias)) == len(distancias)
    assert horarios[0]["arrival_time"] == "05:50:00"
    # 2,2 km a 15 km/h son unos 9 minutos.
    assert horarios[-1]["arrival_time"].startswith("05:58") or horarios[-1][
        "arrival_time"
    ].startswith("05:59")


def test_construir_comparte_terminales_cercanas_y_omite_paradas_sin_uso():
    archivos, _ = gtfs.construir(RUTAS, LINEAS, PARADAS)
    paradas = {p["stop_id"]: p for p in tabla(archivos["stops.txt"])}
    # La llegada de la ida y la salida del retorno están a 11 m: son la misma terminal.
    assert "T-L7-mall-del-rio" in paradas and "T-L7-mall-del-rio-2" not in paradas
    assert paradas["T-L7-mall-del-rio"]["stop_name"] == "Terminal Mall del Río"
    assert paradas["P10"]["stop_name"] == "Av. X y Calle Zeta"
    assert "P11" not in paradas  # a más de 25 m del recorrido


def test_terminales_lejanas_con_el_mismo_nombre_son_paradas_distintas():
    lejos = [
        forma("7", "ida", "Mall del Rio", IDA),
        forma("7", "retorno", "Trigales Altos", [[-78.98, -2.88], *RETORNO]),
    ]
    archivos, _ = gtfs.construir(RUTAS, lejos, [])
    ids = {p["stop_id"] for p in tabla(archivos["stops.txt"])}
    assert {"T-L7-mall-del-rio", "T-L7-mall-del-rio-2"} <= ids


def test_a_zip_no_cambia_si_no_cambian_los_datos():
    archivos, _ = gtfs.construir(RUTAS, LINEAS, PARADAS)
    primero, segundo = gtfs.a_zip(archivos), gtfs.a_zip(dict(archivos))
    assert primero == segundo
    with zipfile.ZipFile(io.BytesIO(primero)) as z:
        assert sorted(z.namelist()) == sorted(archivos)
        assert z.read("routes.txt").decode() == archivos["routes.txt"]
        # Igual en Windows que en Linux (la actualización automática corre en Linux).
        assert {i.create_system for i in z.infolist()} == {3}


def test_nombre_parada_quita_calle_delante_de_avenida():
    assert gtfs.nombre_parada("CALLE AV. REMIGIO CRESPO INTERSECCION AGUSTIN CUEVA") == (
        "Av. Remigio Crespo y Agustin Cueva"
    )
    assert gtfs.nombre_parada("CALLE SANGURIMA INTERSECCION LUIS CORDERO") == (
        "Calle Sangurima y Luis Cordero"
    )
