import json
from datetime import date

from test_gtfs import LINEAS, PARADAS, RUTAS

from morlaco import gtfs, revisar_gtfs

HOY = date(2026, 11, 19)


def _feed(**cambios):
    archivos, _ = gtfs.construir(RUTAS, LINEAS, PARADAS)
    for nombre, (viejo, nuevo) in cambios.items():
        assert viejo in archivos[nombre]
        archivos[nombre] = archivos[nombre].replace(viejo, nuevo, 1)
    return archivos


def _problemas(archivos, hoy=HOY):
    return revisar_gtfs.problemas(gtfs.a_zip(archivos), hoy)


def test_el_feed_que_genera_morlaco_no_tiene_problemas():
    assert _problemas(_feed()) == []


def test_zip_ilegible_o_incompleto():
    assert "no se puede leer" in revisar_gtfs.problemas(b"no es un zip", HOY)[0]
    archivos = _feed()
    del archivos["shapes.txt"]
    assert _problemas(archivos) == ["Faltan archivos en el feed: shapes.txt."]


def test_referencias_rotas():
    problemas = _problemas(_feed(**{"trips.txt": ("L7-ida-LV", "L7-ida-XX")}))
    # El viaje que quedó sin paradas y las paradas que apuntan a un viaje que no existe.
    assert "stop_times.txt usa un `trip_id` que no existe: L7-ida-LV." in problemas
    assert "Viajes con menos de dos paradas: L7-ida-XX." in problemas


def test_parada_fuera_de_cuenca_y_frecuencia_imposible():
    archivos = _feed(
        **{
            "stops.txt": ("-2.9", "-0.2"),
            "frequencies.txt": ("540", "0"),
        }
    )
    problemas = _problemas(archivos)
    assert any(p.startswith("Paradas fuera de Cuenca") for p in problemas)
    assert "Frecuencias con horas o intervalo imposibles: L7-ida-LV." in problemas


def test_horas_que_retroceden():
    archivos = _feed()
    lineas = archivos["stop_times.txt"].splitlines()
    i = next(n for n, fila in enumerate(lineas) if fila.startswith("L7-ida-LV,") and ",2," in fila)
    campos = lineas[i].split(",")
    campos[1] = campos[2] = "05:00:00"
    lineas[i] = ",".join(campos)
    archivos["stop_times.txt"] = "\n".join(lineas) + "\n"
    assert _problemas(archivos) == [
        "Viajes cuya hora o distancia retrocede entre paradas: L7-ida-LV."
    ]


def test_avisa_antes_de_que_venza_el_calendario():
    assert _problemas(_feed(), date(2027, 11, 15)) == [
        "El calendario del feed vence el 2027-12-31: alarga `FIN` en `src/morlaco/gtfs.py`."
    ]
    assert "venció" in _problemas(_feed(), date(2028, 1, 2))[0]


INFORME = {
    "summary": {"validatorVersion": "8.0.1"},
    "notices": [
        {
            "code": "stop_too_far_from_shape",
            "severity": "WARNING",
            "totalNotices": 18,
            "sampleNotices": [{"tripId": "L13-retorno-LV", "stopId": "P1", "match": [0, 0]}],
        },
        {
            "code": "foreign_key_violation",
            "severity": "ERROR",
            "totalNotices": 1,
            "sampleNotices": [
                {"childFilename": "trips.txt", "childFieldName": "route_id", "fieldValue": "LX"}
            ],
        },
        {"code": "unknown_column", "severity": "INFO", "totalNotices": 3, "sampleNotices": []},
    ],
}


def test_validador_sin_avisos_no_pide_nada():
    informe = json.dumps({"summary": {}, "notices": []}).encode()
    assert revisar_gtfs.avisos_del_validador(informe, b'{"notices": []}') == []


def test_validador_lista_errores_primero_y_omite_los_informativos():
    errores, avisos = revisar_gtfs.avisos_del_validador(json.dumps(INFORME).encode())
    assert errores.startswith("El validador oficial da un error `foreign_key_violation` (1 caso;")
    assert "fieldValue=LX" in errores
    assert errores.endswith("rules.html#foreign_key_violation-rule")
    assert "un aviso `stop_too_far_from_shape` (18 casos;" in avisos


def test_validador_que_no_se_ejecuto_o_fallo_por_dentro():
    assert "no se pudo ejecutar" in revisar_gtfs.avisos_del_validador(None)[0]
    assert "no se puede leer" in revisar_gtfs.avisos_del_validador(b"{")[0]
    vacio = json.dumps({"notices": []}).encode()
    fallo = json.dumps({"notices": [{"code": "runtime_exception_in_validator_error"}]}).encode()
    assert revisar_gtfs.avisos_del_validador(vacio, fallo) == [
        "El validador oficial tuvo errores internos: runtime_exception_in_validator_error."
    ]
