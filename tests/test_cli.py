import json
import urllib.error

import pytest

from morlaco import cli
from morlaco.comun import Resultado
from morlaco.salida import a_texto


@pytest.fixture(autouse=True)
def pausas(monkeypatch):
    """Registra las pausas del reintento en vez de esperar de verdad."""
    registro = []
    monkeypatch.setattr(cli.time, "sleep", registro.append)
    return registro


def fuente_ok(descargar):
    return Resultado(archivos={"ok/datos.json": {"valor": 1}}, resumen={"filas": 1})


def fuente_rota(descargar):
    raise ConnectionError("sin red")


def test_un_fallo_no_detiene_las_demas_y_queda_en_estado(tmp_path, capsys):
    fuentes = {"ok": fuente_ok, "rota": fuente_rota}
    codigo = cli.actualizar(["rota", "ok"], tmp_path, fuentes=fuentes)

    assert codigo == 1
    assert json.loads((tmp_path / "ok" / "datos.json").read_text(encoding="utf-8")) == {"valor": 1}
    estado = json.loads((tmp_path / "estado.json").read_text(encoding="utf-8"))
    assert estado["ok"]["ok"] is True
    assert estado["ok"]["resumen"] == {"filas": 1}
    assert estado["rota"]["ok"] is False
    assert estado["rota"]["error"] == "ConnectionError: sin red"
    assert "[error] rota" in capsys.readouterr().err


def test_un_fallo_de_red_se_reintenta_al_final(tmp_path, pausas, capsys):
    llamadas = []

    def fuente_intermitente(descargar):
        llamadas.append(1)
        if len(llamadas) == 1:
            raise urllib.error.URLError("[Errno -3] Temporary failure in name resolution")
        return fuente_ok(descargar)

    codigo = cli.actualizar(
        ["red", "ok"], tmp_path, fuentes={"red": fuente_intermitente, "ok": fuente_ok}
    )
    assert codigo == 0
    assert pausas == [cli.ESPERA_REINTENTO] and len(llamadas) == 2
    estado = json.loads((tmp_path / "estado.json").read_text(encoding="utf-8"))
    assert estado["red"]["ok"] is True and "error" not in estado["red"]
    assert "[reintento] red" in capsys.readouterr().err


def test_los_errores_que_no_son_de_red_no_se_reintentan(tmp_path, pausas):
    def fuente_mal_formada(descargar):
        raise ValueError("el PDF cambió de formato")

    def fuente_404(descargar):
        raise urllib.error.HTTPError("https://x", 404, "Not Found", {}, None)

    fuentes = {"mal": fuente_mal_formada, "404": fuente_404}
    assert cli.actualizar(["mal", "404"], tmp_path, fuentes=fuentes) == 1
    assert pausas == []


def test_un_fallo_conserva_la_ultima_actualizacion_buena(tmp_path):
    cli.actualizar(["x"], tmp_path, fuentes={"x": fuente_ok})
    antes = json.loads((tmp_path / "estado.json").read_text(encoding="utf-8"))["x"]["actualizado"]

    assert cli.actualizar(["x"], tmp_path, fuentes={"x": fuente_rota}) == 1
    estado = json.loads((tmp_path / "estado.json").read_text(encoding="utf-8"))["x"]
    assert estado["actualizado"] == antes
    assert estado["ok"] is False


def test_los_textos_se_escriben_tal_cual_con_crlf(tmp_path):
    def fuente_texto(descargar):
        return Resultado(archivos={"cal/zona.ics": "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"})

    assert cli.actualizar(["t"], tmp_path, fuentes={"t": fuente_texto}) == 0
    assert (tmp_path / "cal" / "zona.ics").read_bytes() == b"BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"


def test_todo_bien_devuelve_cero(tmp_path):
    assert cli.actualizar(["x"], tmp_path, fuentes={"x": fuente_ok}) == 0


def test_fuente_desconocida_es_un_error_de_uso():
    with pytest.raises(SystemExit) as salida:
        cli.main(["actualizar", "inexistente"])
    assert salida.value.code == 2


def test_featurecollection_una_entidad_por_linea_y_json_valido():
    coleccion = {
        "type": "FeatureCollection",
        "metadata": {"fuente": "EMAC EP"},
        "features": [
            {"type": "Feature", "properties": {"zona": n}, "geometry": None} for n in (1, 2)
        ],
    }
    texto = a_texto(coleccion)
    assert json.loads(texto) == coleccion
    lineas = texto.splitlines()
    assert sum('"type":"Feature"' in linea for linea in lineas) == 2
    assert "EMAC EP" in texto  # sin escapar caracteres
