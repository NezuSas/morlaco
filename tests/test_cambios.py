import json
import subprocess
from datetime import date

from morlaco import cambios, cli

ESTADO = {
    "luz": {"ok": True, "archivos": ["luz/suspensiones.json"], "resumen": {"cortes": 3}},
    "farmacias": {"ok": True, "archivos": ["farmacias/turnos.json"], "resumen": {"semanas": 4}},
}


def test_solo_la_hora_en_estado_no_es_un_cambio():
    ahora = json.loads(json.dumps(ESTADO))
    ahora["luz"]["actualizado"] = "2026-11-11T11:00:00+00:00"
    assert not cambios.hay_que_publicar([], ESTADO, ahora)
    assert cambios.hay_que_publicar([], ESTADO, ahora, siempre=True)
    assert cambios.hay_que_publicar(["luz/suspensiones.json"], ESTADO, ahora)


def test_una_fuente_que_empieza_a_fallar_si_es_un_cambio():
    ahora = json.loads(json.dumps(ESTADO))
    ahora["luz"].update(ok=False, error="URLError: sin red")
    assert cambios.hay_que_publicar([], ESTADO, ahora)


def test_mensaje_commit():
    estado = json.loads(json.dumps(ESTADO))
    estado["luz"].update(ok=False, error="URLError: sin red")
    mensaje = cambios.mensaje_commit(["farmacias/turnos.json"], estado, date(2026, 12, 1))
    assert mensaje == (
        "Datos al día (2026-12-01): farmacias\n\n"
        '- farmacias: {"semanas": 4}\n'
        "- luz falló: URLError: sin red\n"
    )
    assert cambios.mensaje_commit([], ESTADO, date(2026, 12, 7)) == (
        "Datos revisados (2026-12-07): sin cambios\n"
    )


def _git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def test_revisar_cambios_con_git(tmp_path, capsys):
    datos = tmp_path / "datos"
    (datos / "luz").mkdir(parents=True)
    (datos / "luz" / "suspensiones.json").write_text("{}", encoding="utf-8")
    (datos / "estado.json").write_text(json.dumps(ESTADO), encoding="utf-8")
    _git("init", "-q", cwd=tmp_path)
    _git("add", "-A", cwd=tmp_path)
    _git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "x", cwd=tmp_path)

    # Solo cambió la hora de la última actualización: nada que publicar.
    ahora = json.loads(json.dumps(ESTADO))
    ahora["luz"]["actualizado"] = "2026-11-11T11:00:00+00:00"
    (datos / "estado.json").write_text(json.dumps(ahora), encoding="utf-8")
    assert cambios.archivos_cambiados(datos) == []
    assert cli.revisar_cambios(datos) == 0
    assert capsys.readouterr().out.strip() == "no"

    # Cambió un archivo de datos: se publica, con su mensaje.
    (datos / "luz" / "suspensiones.json").write_text('{"a": 1}', encoding="utf-8")
    mensaje = tmp_path / "mensaje.txt"
    cli.revisar_cambios(datos, mensaje=mensaje)
    assert capsys.readouterr().out.strip() == "si"
    assert mensaje.read_text(encoding="utf-8").startswith("Datos al día (")
    assert mensaje.read_text(encoding="utf-8").splitlines()[0].endswith("): luz")
