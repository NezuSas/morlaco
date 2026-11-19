import json
from datetime import date

from test_gtfs import LINEAS, PARADAS, RUTAS

from morlaco import gtfs, revision


def _escribir(carpeta, ruta, datos):
    archivo = carpeta / ruta
    archivo.parent.mkdir(parents=True, exist_ok=True)
    archivo.write_text(json.dumps(datos), encoding="utf-8")


def _datos(carpeta, *, fin_farmacias="2026-11-28", hasta_aviso="2026-11-25", revisado="2026-11-10"):
    archivos, _ = gtfs.construir(RUTAS, LINEAS, PARADAS)
    (carpeta / "gtfs").mkdir(parents=True, exist_ok=True)
    (carpeta / "gtfs" / "cuenca-buses.zip").write_bytes(gtfs.a_zip(archivos))
    _escribir(
        carpeta, "estado.json", {"luz": {"ok": True, "actualizado": "2026-11-10T12:00:00+00:00"}}
    )
    _escribir(
        carpeta,
        "farmacias/turnos.json",
        {"turnos": [{"inicio": "2026-11-21", "fin": fin_farmacias}]},
    )
    _escribir(
        carpeta,
        "manual/transporte.json",
        {
            "metadata": {"revisado": revisado},
            "avisos": [
                {"lineas": ["11", "11B"], "hasta": hasta_aviso},
                {"lineas": ["1"], "hasta": "2027-03-31"},
                {"lineas": ["5"], "hasta": "2027-03-31"},
            ],
        },
    )
    _escribir(
        carpeta,
        "manual/basura.json",
        {"metadata": {"revisado": revisado}, "feriados": {"hasta": "2027-03-31"}},
    )
    _escribir(
        carpeta,
        "manual/feriados.json",
        {
            "metadata": {"revisado": revisado},
            "dias": [{"fecha": "2026-12-25"}, {"fecha": "2027-05-24"}],
        },
    )


def test_todo_al_dia_no_pide_nada(tmp_path):
    _datos(tmp_path)
    assert revision.revisar(tmp_path, date(2026, 11, 10)) == []
    assert revision.informe([], date(2026, 11, 10)) == ""


def test_avisa_de_lo_que_vence_y_de_las_farmacias_que_se_acaban(tmp_path):
    _datos(tmp_path)
    pendientes = revision.revisar(tmp_path, date(2026, 11, 22))
    assert [p["tema"] for p in pendientes] == ["farmacias", "transporte"]
    assert "hasta el 2026-11-28" in pendientes[0]["mensaje"]
    assert "líneas 11, 11B vence el 2026-11-25" in pendientes[1]["mensaje"]
    informe = revision.informe(pendientes, date(2026, 11, 22))
    assert informe.startswith("Revisión automática del 2026-11-22")
    assert informe.count("- [ ] ") == 2


def test_los_avisos_del_mismo_dia_van_juntos_y_los_vencidos_no_cuentan(tmp_path):
    _datos(tmp_path, fin_farmacias="2027-04-30")
    pendientes = revision.revisar(tmp_path, date(2027, 3, 25))
    transporte = [p for p in pendientes if p["tema"] == "transporte"]
    assert len(transporte) == 1  # el de la 11 ya venció; el 1 y el 5, juntos
    assert "líneas 1, 5 vence el 2027-03-31" in transporte[0]["mensaje"]
    assert any(p["tema"] == "basura" for p in pendientes)
    assert sum(p["tema"] == "manual" for p in pendientes) == 3  # más de 90 días sin revisar


def test_fuente_que_falla_y_farmacias_sin_turnos(tmp_path):
    _datos(tmp_path)
    _escribir(
        tmp_path,
        "estado.json",
        {
            "farmacias": {
                "ok": False,
                "actualizado": "2026-11-01T11:00:00+00:00",
                "error": "HTTPError: 404",
            }
        },
    )
    _escribir(tmp_path, "farmacias/turnos.json", {"turnos": []})
    pendientes = revision.revisar(tmp_path, date(2026, 11, 10))
    assert pendientes[0] == {
        "tema": "farmacias",
        "mensaje": "La fuente `farmacias` falla desde el 2026-11-01: HTTPError: 404",
    }
    assert pendientes[1]["mensaje"] == "No hay turnos de farmacias publicados."


def test_avisa_cuando_se_acaba_la_lista_de_feriados(tmp_path):
    _datos(tmp_path, fin_farmacias="2027-06-30", revisado="2027-04-20")
    assert not any(p["tema"] == "feriados" for p in revision.revisar(tmp_path, date(2027, 4, 23)))
    feriados = [p for p in revision.revisar(tmp_path, date(2027, 4, 24)) if p["tema"] == "feriados"]
    assert len(feriados) == 1 and "termina el 2027-05-24" in feriados[0]["mensaje"]
    _escribir(
        tmp_path, "manual/feriados.json", {"metadata": {"revisado": "2027-04-20"}, "dias": []}
    )
    feriados = [p for p in revision.revisar(tmp_path, date(2027, 4, 24)) if p["tema"] == "feriados"]
    assert "está vacía" in feriados[0]["mensaje"]


def test_avisa_de_las_notas_de_descanso_sin_revisar(tmp_path):
    _datos(tmp_path)
    _escribir(
        tmp_path,
        "feriados/avisos.json",
        {"avisos": [
            {"publicado": "2026-11-12", "titulo": "Noboa decreta descanso el 24 de diciembre",
             "enlace": "https://elmercurio.com.ec/decreto-24/"},
            {"publicado": "2026-11-01", "titulo": "Nota vieja", "enlace": "https://x/vieja"},
        ]},
    )  # fmt: skip
    feriados = [
        p for p in revision.revisar(tmp_path, date(2026, 11, 13)) if p["tema"] == "feriados"
    ]
    assert len(feriados) == 1  # la vieja es anterior a la última revisión (2026-11-10)
    assert "«Noboa decreta descanso el 24 de diciembre»" in feriados[0]["mensaje"]
    assert "https://elmercurio.com.ec/decreto-24/" in feriados[0]["mensaje"]


def test_avisa_si_el_gtfs_tiene_problemas_o_falta(tmp_path):
    _datos(tmp_path)
    archivos, _ = gtfs.construir(RUTAS, LINEAS, PARADAS)
    archivos["trips.txt"] = archivos["trips.txt"].replace("L7-ida-LV", "L7-ida-XX", 1)
    (tmp_path / "gtfs" / "cuenca-buses.zip").write_bytes(gtfs.a_zip(archivos))
    pendientes = revision.revisar(tmp_path, date(2026, 11, 10))
    assert {p["tema"] for p in pendientes} == {"gtfs"}
    assert any("L7-ida-LV" in p["mensaje"] for p in pendientes)

    (tmp_path / "gtfs" / "cuenca-buses.zip").unlink()
    (pendiente,) = revision.revisar(tmp_path, date(2026, 11, 10))
    assert "No se ha publicado" in pendiente["mensaje"]


def test_lee_el_informe_del_validador_oficial_si_se_le_pasa(tmp_path):
    _datos(tmp_path)
    validacion = tmp_path / "validacion"
    # En local no se pasa carpeta y no se mira.
    assert revision.revisar(tmp_path, date(2026, 11, 10)) == []
    # El workflow la pasa: si el validador no dejó informe, avisa.
    (pendiente,) = revision.revisar(tmp_path, date(2026, 11, 10), validacion)
    assert "no se pudo ejecutar" in pendiente["mensaje"]
    validacion.mkdir()
    (validacion / "report.json").write_text(
        json.dumps({"notices": [{"code": "x_error", "severity": "ERROR", "totalNotices": 2}]}),
        encoding="utf-8",
    )
    (pendiente,) = revision.revisar(tmp_path, date(2026, 11, 10), validacion)
    assert pendiente["tema"] == "gtfs" and "`x_error` (2 casos)" in pendiente["mensaje"]
