import json
from datetime import date

from morlaco import revision


def _escribir(carpeta, ruta, datos):
    archivo = carpeta / ruta
    archivo.parent.mkdir(parents=True, exist_ok=True)
    archivo.write_text(json.dumps(datos), encoding="utf-8")


def _datos(carpeta, *, fin_farmacias="2026-11-28", hasta_aviso="2026-11-25", revisado="2026-11-10"):
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
    assert sum(p["tema"] == "manual" for p in pendientes) == 2  # más de 90 días sin revisar


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
